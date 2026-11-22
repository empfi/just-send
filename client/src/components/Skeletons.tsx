export function FilesSkeleton({ view }: { view: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <section className="files-list" aria-hidden="true">
        <div className="skeleton-table">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton skeleton-dot" />
              <span className="skeleton skeleton-line" style={{ flex: 1 }} />
              <span className="skeleton skeleton-line" style={{ width: 56 }} />
              <span className="skeleton skeleton-line" style={{ width: 72 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="files-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="file-card skeleton-card" key={index}>
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton skeleton-line" style={{ width: '72%', marginTop: 10 }} />
          <div className="skeleton skeleton-line" style={{ width: '38%', height: 10, marginTop: 8 }} />
        </div>
      ))}
    </section>
  );
}

export function ClipsSkeleton() {
  return (
    <div className="clips-grid" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="clip-card skeleton-card" key={index}>
          <div className="skeleton skeleton-line" style={{ width: '90%' }} />
          <div className="skeleton skeleton-line" style={{ width: '75%' }} />
          <div className="skeleton skeleton-line" style={{ width: '45%', height: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function PreviewSkeleton() {
  return (
    <div className="skeleton-preview-lines" aria-hidden="true">
      {[92, 78, 86, 64, 88, 71].map((width, index) => (
        <div key={index} className="skeleton skeleton-line" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}
