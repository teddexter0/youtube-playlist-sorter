import Link from "next/link";
export default function TermsPage() {
  return <article className="panel policy"><p className="eyebrow">THE HOUSE RULES</p><h1>Good viewing. Fair play.</h1>
    <p>Personal TV is a playlist-curation tool operated by Ted Dexter. By using it you agree to these terms and <Link href="/privacy">our privacy policy</Link>. Contact: <a href="https://github.com/teddexter0/youtube-playlist-sorter/issues">support via GitHub</a>.</p>
    <h2>Your account, your choice</h2><p>Only connect accounts you are authorized to use. You choose whether to create or fill playlists, enable daily updates, or send data for optional AI ranking. You can disconnect at any time.</p>
    <h2>It is still YouTube</h2><p>Videos play on YouTube. Availability, regional restrictions, ads within YouTube and playback are controlled by YouTube. This app adds no advertisements and does not remove or bypass YouTube advertisements. You agree to <a href="https://www.youtube.com/t/terms">YouTube&apos;s Terms of Service</a>.</p>
    <h2>A little room for imperfection</h2><p>Recommendations and metadata screening can make mistakes. We do not guarantee every video&apos;s suitability or completeness. API quotas, outages and Google authorization restrictions can interrupt the service. No affiliation with YouTube, Google or the television brands that inspired the visual style is claimed.</p>
    <h2>Looking after each other</h2><p>Do not abuse the service, attempt to access someone else&apos;s data, or use it to violate others&apos; rights. We may limit abuse or change the service. These terms do not override rights provided by applicable law.</p>
    <Link className="button" href="/tv">Back to your station</Link>
  </article>;
}
