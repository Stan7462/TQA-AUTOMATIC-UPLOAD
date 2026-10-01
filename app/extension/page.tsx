import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Install the TQA Catalyst extension",
  description: "Install and connect the TQA Catalyst Uploader Chrome extension.",
};

export default function ExtensionInstallPage() {
  const storeUrl = process.env.TQA_EXTENSION_STORE_URL?.trim();

  return <main className="management-page login-dark">
    <div className="management-head">
      <span className="kicker">TQA AUTOMATIC UPLOAD</span>
      <h1>Catalyst extension</h1>
      <p>Install the Chrome extension, then connect it to your company with your permanent Admin ID and password.</p>
    </div>
    <section className="management-card extension-install-card">
      <div className="extension-install-steps" role="list">
        <div role="listitem"><strong>Finish company setup.</strong><span>Create your permanent Admin ID and password in the TQA app.</span></div>
        <div role="listitem"><strong>Install the extension.</strong><span>Use Chrome on the computer that runs Catalyst.</span></div>
        <div role="listitem"><strong>Connect your company.</strong><span>Open the extension and enter the same permanent Admin ID and password.</span></div>
      </div>
      {storeUrl ? <a className="button dark" href={storeUrl} target="_blank" rel="noreferrer">Install from Chrome Web Store</a> : <p className="qc-notice">The Chrome Web Store installation link is being prepared. Contact the TQA owner before installing the extension.</p>}
      <p className="extension-install-note">The extension keeps only a short-lived company session. It does not save your admin password.</p>
    </section>
  </main>;
}
