import { LogoMark } from "./icons";

export function BootSplash({ leaving = false }: { leaving?: boolean }) {
  return (
    <div className={`eco-boot${leaving ? " eco-boot--leaving" : ""}`} role="status" aria-live="polite">
      <div className="eco-boot__inner">
        <LogoMark size={52} />
        <p className="eco-boot__title">EcoRise</p>
        <p className="eco-boot__msg">
          <span className="eco-spinner" aria-hidden="true" /> Building the town…
        </p>
      </div>
    </div>
  );
}

export function BootError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="eco-boot eco-boot--error" role="alert">
      <div className="eco-boot__inner">
        <LogoMark size={44} />
        <p className="eco-boot__title">The city couldn&rsquo;t start</p>
        <p className="eco-boot__msg">
          Something stopped the game engine from loading. Your saved progress is safe. Try again, or reload the page.
        </p>
        {message && <p className="eco-boot__detail">Details: {message}</p>}
        <div className="eco-row">
          <button type="button" className="eco-btn eco-btn--primary" onClick={onRetry} autoFocus>
            Try again
          </button>
          <button type="button" className="eco-btn" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
