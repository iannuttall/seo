export function oauthCallbackPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>SEO Skills is connected</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        align-items: center;
        background: #fafafa;
        color: #343434;
        display: flex;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }
      main { margin: 0 auto; max-width: 640px; width: 100%; }
      header { align-items: center; display: flex; gap: 10px; }
      .mark {
        align-items: center;
        background: #343434;
        color: #fafafa;
        display: inline-flex;
        font-size: 15px;
        font-weight: 700;
        height: 30px;
        justify-content: center;
        letter-spacing: -0.04em;
        width: 30px;
      }
      .name { font-size: 15px; font-weight: 650; letter-spacing: -0.02em; }
      section { border-top: 1px solid #e5e5e5; margin-top: 32px; padding-top: 32px; }
      .status { color: #2c8bb7; font-size: 14px; font-weight: 600; margin: 0 0 12px; }
      h1 { font-size: clamp(36px, 8vw, 56px); letter-spacing: -0.055em; line-height: 0.98; margin: 0; }
      p { color: #686868; font-size: 18px; line-height: 1.55; margin: 20px 0 0; max-width: 560px; }
      code {
        background: #f0f0f0;
        border: 1px solid #e5e5e5;
        color: #343434;
        display: inline-block;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.9em;
        padding: 2px 6px;
      }
      .note { font-size: 15px; margin-top: 36px; }
      @media (prefers-color-scheme: dark) {
        body { background: #1c1c1c; color: #fafafa; }
        .mark { background: #fafafa; color: #1c1c1c; }
        section { border-color: #484848; }
        .status { color: #8ed2ef; }
        p { color: #b8b8b8; }
        code { background: #282828; border-color: #484848; color: #fafafa; }
      }
    </style>
  </head>
  <body>
    <main>
      <header><span class="mark" aria-hidden="true">s</span><span class="name">SEO Skills</span></header>
      <section>
        <p class="status">Google account connected</p>
        <h1>You're ready to inspect your search data.</h1>
        <p>Return to your terminal and run <code>seo start</code> to choose a site and run your first report.</p>
        <p class="note">You can close this tab. SEO Skills only requested read-only access.</p>
      </section>
    </main>
  </body>
</html>`
}
