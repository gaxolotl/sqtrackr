"use client";

export function FeatureDisabled({ name }: { name: string }) {
  return (
    <main className="page">
      <div className="state-panel">
        {name} is disabled on this tracker.
      </div>
    </main>
  );
}
