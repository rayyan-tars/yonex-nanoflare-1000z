export function Splash({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <div className="gh-splash" role={error ? "alert" : "status"}>
      <div className="gh-splash__logo" aria-hidden="true">
        <span>🌿</span>
      </div>
      <h1 className="gh-display">Greenhold</h1>
      <p>{error ? "The town couldn't start." : "Building your town…"}</p>
      {error && (
        <>
          <p className="gh-small">{error}</p>
          {onRetry && (
            <button type="button" className="gh-btn gh-btn--green" onClick={onRetry}>
              Try again
            </button>
          )}
        </>
      )}
      {!error && <div className="gh-splash__bar" aria-hidden="true" />}
    </div>
  );
}
