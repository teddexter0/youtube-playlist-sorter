import { getCurrentUserId } from "@/lib/session";
import { getLogs } from "@/lib/store";

export default async function LogsPage() {
  const userId = getCurrentUserId();
  const logs = userId ? await getLogs(userId, 150) : [];

  if (!userId) {
    return (
      <section className="panel">
        <h1>Logs</h1>
        <p>Connect Google to see scan and cleanup logs.</p>
        <a href="/api/auth/google/start" className="button">
          Connect Google account
        </a>
      </section>
    );
  }

  return (
    <section>
      <h1>Logs</h1>
      <p>Every scan, duplicate skip, insert, quota failure, and cleanup action is written here.</p>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Level</th>
            <th>Message</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td className={`status ${log.level === "error" ? "error" : log.level === "warn" ? "kept" : "processed"}`}>
                {log.level}
              </td>
              <td>{log.message}</td>
              <td>
                <code>{log.data ? JSON.stringify(log.data) : ""}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
