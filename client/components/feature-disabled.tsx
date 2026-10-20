"use client";

export function FeatureDisabled({ name }: { name: string }) {
  return (
    <main className="page centered-state-page">
      <div className="state-panel state-panel-centered">
        {name} is disabled on this tracker.
      </div>
    </main>
  );
}
