import parrotIcon from '../../../web/public/icons/arachat-parrot-icon-1024.png';

export function BrandMark({ compact = false }) {
  return (
    <div className={`brand-mark ${compact ? 'is-compact' : ''}`}>
      <img src={parrotIcon} alt="" />
      <span>AraChat</span>
    </div>
  );
}

export { parrotIcon };
