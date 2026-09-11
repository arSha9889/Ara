export const STICKER_PACK = [
  { id: 'ara-alt', label: 'Альт', src: '/stickers/alt.jpeg' },
  { id: 'ara-solidity', label: 'Чисто для солидности', src: '/stickers/solidity.jpeg' },
  { id: 'ara-school-holiday', label: 'Ура, сегодня не идём в школу, актировка!', src: '/stickers/school-holiday.jpeg' },
  { id: 'ara-aksakal-approves', label: 'Аксакал одобряет', src: '/stickers/aksakal-approves.jpeg' },
  { id: 'ara-sigma', label: 'Чисто сигма', src: '/stickers/sigma.jpeg' },
  { id: 'ara-our-elephant', label: 'Наш слон', src: '/stickers/our-elephant.jpeg' },
  { id: 'ara-civilization', label: 'Ну что, поехали в цивилизацию', src: '/stickers/civilization.jpeg' },
  { id: 'ara-sakhavud', label: 'Сахавуд: Голливуд отдыхает', src: '/stickers/sakhavud.jpeg' },
  { id: 'ara-salam-relatives', label: 'Салам, родной!', src: '/stickers/salam-relatives.jpeg' },
  { id: 'ara-rahmet', label: 'Рахмет, спасибо', src: '/stickers/rahmet.jpeg' },
  { id: 'ara-tea', label: 'Куй шай!', src: '/stickers/tea.jpeg' },
];

const STICKERS_BY_ID = new Map(STICKER_PACK.map((sticker) => [sticker.id, sticker]));

export function Sticker({ id, label, className = '' }) {
  const sticker = STICKERS_BY_ID.get(id);
  const accessibleLabel = label || sticker?.label || 'Стикер';

  if (!sticker) {
    return <span className={`sticker sticker-unavailable ${className}`.trim()} role="img" aria-label={accessibleLabel}>?</span>;
  }

  return <img className={`sticker sticker-${id} ${className}`.trim()} src={sticker.src} alt={accessibleLabel} loading="lazy" draggable="false" />;
}
