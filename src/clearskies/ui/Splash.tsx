export function Splash({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <div className="cs-splash" role={error ? "alert" : "status"}>
      <h1 className="cs-display">Clear Skies</h1>
      <p>{error ? "The town couldn't load." : "Loading the town…"}</p>
      {error && (
        <>
          <p className="cs-small">{error}</p>
          {onRetry && (
            <button type="button" className="cs-btn cs-btn--go" onClick={onRetry}>
              Try again
            </button>
          )}
        </>
      )}
      {!error && <div className="cs-splash__bar" aria-hidden="true" />}
    </div>
  );
}
