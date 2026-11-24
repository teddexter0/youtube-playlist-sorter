const fs = require('node:fs'), ts = require('typescript');
const test = require('node:test'), assert = require('node:assert/strict');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { tvProfileSchema, passesMetadataFilter, planTvSearches } = require('../lib/tv-profile.ts');
const { stationProfiles } = require('../lib/station-presets.ts');
const { isLongFormVideo } = require('../lib/video-format.ts');
const now = Date.parse('2026-11-01T12:00:00Z');
const video = (title, patch = {}) => ({ videoId: 'example0001', title, description: '', channelTitle: 'A creator', channelId: 'a', topic: '', durationSeconds: 900, publishedAt: '2026-10-30', score: .9, reason: '', ...patch });

test('nostalgia requires a known show and an appropriate format, not a network label', () => {
  const profile = tvProfileSchema.parse({ stationMode: 'childhood', franchises: ['Generator Rex', 'Lab Rats', 'Avatar: The Last Airbender', 'Regular Show'], maxVideoMinutes: 480, sessionMinutes: 720, lightViewing: false });
  for (const title of ['The ENTIRE Story of Generator Rex in 104 Minutes', 'Lab Rats was Disney\'s craziest show', 'Avatar: The Last Airbender full scene', 'Regular Show retrospective']) {
    assert.equal(passesMetadataFilter(video(title, { durationSeconds: 6240 }), profile, now), true, title);
  }
  for (const title of ['Disney Channel cartoons for toddlers', 'Unlisted Show retrospective', 'Lab Rats preschool learning for babies', 'Regular Show nursery rhymes', 'Generator Rex toy unboxing']) {
    assert.equal(passesMetadataFilter(video(title), profile, now), false, title);
  }
  assert.equal(passesMetadataFilter(video('Generator Rex retrospective', { description: 'Other shows include Lab Rats and Avatar.' }), profile, now), true);
  assert.equal(passesMetadataFilter(video('Unrelated nursery lesson', { description: 'Generator Rex Lab Rats' }), profile, now), false, 'description stuffing must not establish a title match');
});

test('weekly nostalgia discovery rotates actual titles and searches new uploads instead of forcing an archive cutoff', () => {
  const franchises = Array.from({ length: 10 }, (_, index) => `Show ${index + 1}`);
  const profile = tvProfileSchema.parse({ stationMode: 'childhood', franchises });
  const initial = planTvSearches(profile, 0), next = planTvSearches(profile, 8);
  assert.equal(initial.length, 8);
  assert.ok(initial.every(q => q.archive === false && q.recentDays === 365));
  assert.ok(next.some(q => q.topic.startsWith('Show 9 ')));
  assert.deepEqual(planTvSearches(tvProfileSchema.parse({ stationMode: 'childhood' }), 0), []);
});

test('specialist publishers can contribute fresh short uploads that fit the station', () => {
  const pop = tvProfileSchema.parse({ stationMode: 'popculture' });
  const life = tvProfileSchema.parse({ stationMode: 'lifeskills' });
  const preview = video('Cast moments from the set', { channelId: 'UCjDsbbzHgTrGc4Ff26TJtsA', durationSeconds: 130 });
  const skills = video('Emergency kit basics', { channelId: 'UC0aMPje3ZACnQPKM_qzY0vw', durationSeconds: 140 });
  assert.equal(passesMetadataFilter(preview, pop, now), true);
  assert.equal(passesMetadataFilter(skills, life, now), true);
  assert.equal(passesMetadataFilter({ ...skills, title: 'Our charity fundraiser' }, life, now), false);
  assert.equal(passesMetadataFilter({ ...skills, channelId: 'unverified' }, life, now), false);
});

test('no-Shorts rule rejects the entire ambiguous range including three-minute unlabelled videos', () => {
  for (const seconds of [0, 60, 120, 179, 180, NaN]) assert.equal(isLongFormVideo(video('Official trailer', { durationSeconds: seconds })), false);
  assert.equal(isLongFormVideo(video('Official trailer', { durationSeconds: 181 })), true);
  assert.equal(isLongFormVideo(video('Extended #Shorts', { durationSeconds: 250 })), false);
  for (const stationMode of ['tv', 'childhood', 'faith', 'popculture', 'lifeskills']) {
    assert.equal(passesMetadataFilter(video('Something', { durationSeconds: 180 }), tvProfileSchema.parse({ stationMode }), now), false);
  }
});

test('horror rejection applies to official publishers even with comfort mode and AI off', () => {
  const profile = tvProfileSchema.parse({ excludeHorror: true, strictComfort: false, aiEnabled: false });
  for (const title of ['The Conjuring official trailer', 'A Slasher official trailer', 'Something new official trailer']) {
    const description = title.startsWith('Something') ? 'A supernatural horror film about demonic possession.' : '';
    assert.equal(passesMetadataFilter(video(title, { description, officialTrailer: true, durationSeconds: 210 }), profile, now), false);
  }
  assert.equal(passesMetadataFilter(video('A space adventure official trailer', { officialTrailer: true, durationSeconds: 210 }), profile, now), true);
});

test('personal childhood titles and reference links remain scoped to the owner profile', () => {
  const user = { userId: 'owner', playlistIds: {} };
  const preferences = { interests: ['Science'], childhood: { franchises: ['Show One'], referenceUrls: ['https://www.imdb.com/list/ls123/'], preferredHandles: ['example_creator'] } };
  const owner = stationProfiles(user, true, preferences);
  assert.deepEqual(owner.childhood.franchises, ['Show One']);
  assert.equal(owner.childhood.maxVideoMinutes, 480);
  assert.equal(owner.tv.excludeHorror, true);
  const other = stationProfiles({ userId: 'other', playlistIds: {} });
  assert.deepEqual(other.childhood.franchises, []);
  assert.deepEqual(other.childhood.referenceUrls, []);
});
