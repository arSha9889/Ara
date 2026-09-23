import { Icon } from '../../../shared/ui/Icon.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';

function CometPerson({ variant, withPhone = false }) {
  return (
    <div className={`comet-person comet-person-${variant}`}>
      <span className="comet-person-hair" />
      <span className="comet-person-head"><i /><i /><b /></span>
      <span className="comet-person-neck" />
      <span className="comet-person-body" />
      <span className="comet-person-arm comet-person-arm-left" />
      <span className="comet-person-arm comet-person-arm-right" />
      {withPhone ? <span className="comet-person-phone"><Icon name="smartphone" size={16} /></span> : null}
    </div>
  );
}

function CometPhone({ mode = 'message', t }) {
  return (
    <div className={`comet-phone is-${mode}`}>
      <span className="comet-phone-speaker" />
      <div className="comet-phone-screen">
        <div className="comet-phone-header"><span className="comet-mini-avatar">A</span><span><b>AraChat</b><small><i /> {t('comet.sceneOnline')}</small></span></div>
        {mode === 'voice' ? (
          <div className="comet-voice-note"><span className="comet-voice-play">▶</span><span className="comet-voice-wave"><i /><i /><i /><i /><i /><i /><i /></span><small>0:12</small></div>
        ) : mode === 'privacy' ? (
          <div className="comet-phone-privacy"><span><Icon name="shield" size={18} /></span><b>AraChat ID</b><small>•••• 3741</small><i>{t('comet.scenePhoneOptional')}</i></div>
        ) : (
          <div className="comet-mini-dialog"><span>{t('comet.sceneMessageOne')}</span><span>{t('comet.sceneMessageTwo')}</span><small>{t('comet.sceneDelivered')}</small></div>
        )}
      </div>
    </div>
  );
}

export function CometScene({ type = 'message' }) {
  const { t } = useI18n();
  const isVoice = type === 'voice';
  const isDevices = type === 'devices';
  const isPrivacy = type === 'privacy';

  return (
    <figure className={`comet-scene is-${type}`} aria-hidden="true">
      <span className="comet-scene-grid" />
      <span className="comet-star comet-star-one" />
      <span className="comet-star comet-star-two" />
      <span className="comet-star comet-star-three" />
      <span className="comet-signal comet-signal-one" />
      <span className="comet-signal comet-signal-two" />
      <span className="comet-orbit comet-orbit-one" />
      <span className="comet-orbit comet-orbit-two" />
      <span className="comet-trajectory"><i /></span>
      {isDevices ? <span className="comet-laptop"><span /><b>AraChat</b></span> : null}
      {isPrivacy ? <span className="comet-privacy-halo"><Icon name="shield" size={31} /></span> : null}
      <CometPerson variant={isPrivacy ? 'violet' : 'blue'} withPhone={!isDevices} />
      <CometPhone mode={isVoice ? 'voice' : isPrivacy ? 'privacy' : 'message'} t={t} />
      {!isPrivacy ? <CometPerson variant={isVoice ? 'orange' : 'mint'} withPhone={isVoice} /> : null}
    </figure>
  );
}
