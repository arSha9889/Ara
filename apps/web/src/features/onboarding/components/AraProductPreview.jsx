export function AraProductPreview({ compact = false }) {
  return (
    <figure className={`ara-product-preview ${compact ? 'is-compact' : ''}`}>
      <div className="ara-product-preview-aura" aria-hidden="true" />
      <div className="ara-product-preview-frame">
        <img
          src="/images/arachat-desktop-preview.png"
          alt="Интерфейс AraChat на компьютере: список личных чатов и рабочая область для общения."
          width="1538"
          height="814"
        />
      </div>
      <figcaption>Интерфейс AraChat для личного общения</figcaption>
    </figure>
  );
}
