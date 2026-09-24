import { useI18n } from '../../../app/providers/I18nProvider.jsx';

function ConstellationNode({ className, x, y }) {
  return (
    <g className={`geo-signal-node ${className}`} transform={`translate(${x} ${y})`}>
      <circle className="geo-signal-node-halo" r="29" />
      <circle className="geo-signal-node-surface" r="18" />
      <circle className="geo-signal-node-head" cx="0" cy="-5" r="5" />
      <path className="geo-signal-node-shoulders" d="M-10 12c2-7 18-7 20 0" />
    </g>
  );
}

export function GeoSignalScene() {
  const { t } = useI18n();

  return (
    <figure className="geo-signal-scene" role="img" aria-label={t('comet.worldSignalAria')}>
      <svg viewBox="0 0 680 520" aria-hidden="true" focusable="false">
        <g className="geo-signal-grid">
          <path d="M50 110H630M50 190H630M50 270H630M50 350H630M50 430H630" />
          <path d="M110 60V460M210 60V460M310 60V460M410 60V460M510 60V460M610 60V460" />
        </g>

        <g className="geo-signal-orbits">
          <ellipse cx="318" cy="264" rx="236" ry="142" />
          <ellipse cx="318" cy="264" rx="173" ry="103" />
        </g>

        <g className="geo-signal-routes">
          <path className="geo-signal-route geo-signal-route-origin" d="M164 307C205 294 235 275 266 264" />
          <path className="geo-signal-route geo-signal-route-north" d="M317 248C359 209 408 165 448 142" />
          <path className="geo-signal-route geo-signal-route-east" d="M321 267C393 270 452 270 524 270" />
          <path className="geo-signal-route geo-signal-route-south" d="M317 281C361 323 406 371 450 403" />
          <path className="geo-signal-route geo-signal-route-far" d="M474 132C519 112 564 99 606 104" />
        </g>

        <g className="geo-signal-route-glow">
          <path className="geo-signal-route geo-signal-route-origin" d="M164 307C205 294 235 275 266 264" />
          <path className="geo-signal-route geo-signal-route-north" d="M317 248C359 209 408 165 448 142" />
          <path className="geo-signal-route geo-signal-route-east" d="M321 267C393 270 452 270 524 270" />
          <path className="geo-signal-route geo-signal-route-south" d="M317 281C361 323 406 371 450 403" />
          <path className="geo-signal-route geo-signal-route-far" d="M474 132C519 112 564 99 606 104" />
        </g>

        <g className="geo-signal-origin" transform="translate(132 310)">
          <g className="geo-signal-motion-wrapper geo-signal-origin-pulse-one">
            <circle className="geo-signal-origin-pulse" r="46" />
          </g>
          <g className="geo-signal-motion-wrapper geo-signal-origin-pulse-two">
            <circle className="geo-signal-origin-pulse" r="33" />
          </g>
          <circle className="geo-signal-origin-halo" r="23" />
          <circle className="geo-signal-origin-core" r="11" />
          <path className="geo-signal-origin-mark" d="M-4 1 1 6 8-7" />
        </g>
        <text className="geo-signal-origin-caption" x="132" y="382" textAnchor="middle">{t('comet.worldSignalSource')}</text>

        <ConstellationNode className="geo-signal-node-central" x="292" y="263" />
        <ConstellationNode className="geo-signal-node-north" x="468" y="130" />
        <ConstellationNode className="geo-signal-node-east" x="548" y="270" />
        <ConstellationNode className="geo-signal-node-south" x="470" y="418" />
        <ConstellationNode className="geo-signal-node-far" x="622" y="104" />

        <g className="geo-signal-packets">
          <g className="geo-signal-motion-wrapper geo-signal-packet-one">
            <circle className="geo-signal-packet" cx="213" cy="290" r="4" />
          </g>
          <g className="geo-signal-motion-wrapper geo-signal-packet-two">
            <circle className="geo-signal-packet" cx="391" cy="190" r="4" />
          </g>
          <g className="geo-signal-motion-wrapper geo-signal-packet-three">
            <circle className="geo-signal-packet" cx="408" cy="270" r="4" />
          </g>
        </g>

        <g className="geo-signal-stars">
          <circle cx="250" cy="124" r="3" />
          <circle cx="394" cy="80" r="2" />
          <circle cx="579" cy="190" r="3" />
          <circle cx="568" cy="382" r="2" />
          <circle cx="347" cy="444" r="3" />
          <circle cx="92" cy="182" r="2" />
        </g>
      </svg>
    </figure>
  );
}
