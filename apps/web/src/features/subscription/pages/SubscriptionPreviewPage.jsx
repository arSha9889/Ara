import { Link } from 'react-router-dom';

import { AraFooter } from '../../onboarding/components/AraFooter.jsx';
import { PublicSiteHeader } from '../../onboarding/components/PublicSiteHeader.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';

const PLANS = [
  {
    name: 'Lite',
    description: 'Больше пространства для важных разговоров и файлов.',
    features: ['Больше места для медиа', 'Файлы большего размера', 'Дополнительные устройства'],
  },
  {
    name: 'Medium',
    description: 'Расширенные возможности для активного общения на разных устройствах.',
    features: ['Всё из Lite', 'Расширенные лимиты', 'Полный набор тем оформления'],
    featured: true,
  },
  {
    name: 'Extra',
    description: 'Максимум места и возможностей для тех, кто пользуется AraChat каждый день.',
    features: ['Всё из Medium', 'Максимальные лимиты', 'Ранний доступ к отдельным новинкам'],
  },
];

export function SubscriptionPreviewPage() {
  return (
    <main className="public-page ara-page ara-subscription-page" aria-labelledby="subscription-title">
      <div className="ara-shell ara-subscription-shell">
        <a className="ara-skip-link" href="#subscription-content">К содержанию</a>
        <PublicSiteHeader activePage="subscription" />

        <section className="ara-subscription-hero" id="subscription-content" tabIndex="-1">
          <div>
            <p className="ara-overline">Будущий интерфейс</p>
            <h1 id="subscription-title">Подписка для AraChat</h1>
            <p>Показываем, как в будущем будут устроены тарифы и возможности аккаунта. Сейчас это демонстрационный макет: оплатить или подключить подписку нельзя.</p>
          </div>
          <aside className="ara-subscription-notice" aria-label="Статус интерфейса">
            <span aria-hidden="true"><Icon name="shield" size={22} /></span>
            <div>
              <strong>Оплата не подключена</strong>
              <p>Нет платёжных форм, цен, данных аккаунта и автоматических списаний.</p>
            </div>
          </aside>
        </section>

        <section className="ara-plan-grid" aria-label="Концепты тарифов">
          {PLANS.map((plan) => (
            <article className={`ara-plan-card ${plan.featured ? 'is-featured' : ''}`} key={plan.name}>
              <div className="ara-plan-card-head">
                <span className="ara-plan-status"><Icon name="sparkles" size={15} />Концепт</span>
                {plan.featured ? <span className="ara-plan-note">Основной вариант</span> : null}
              </div>
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map((feature) => <li key={feature}><Icon name="check" size={17} />{feature}</li>)}
              </ul>
              <span className="ara-plan-unavailable">Подключение появится позже</span>
            </article>
          ))}
        </section>

        <section className="ara-subscription-principles" aria-labelledby="subscription-principles-title">
          <div>
            <p className="ara-overline">Принцип работы</p>
            <h2 id="subscription-principles-title">Один аккаунт — одни возможности на всех устройствах.</h2>
          </div>
          <ol>
            <li><span>1</span><div><strong>Подписка относится к аккаунту</strong><p>Она не привязана к одному телефону, браузеру или компьютеру.</p></div></li>
            <li><span>2</span><div><strong>Статус синхронизируется между приложениями</strong><p>Android, Desktop и будущие клиенты будут получать одинаковые права аккаунта.</p></div></li>
            <li><span>3</span><div><strong>Управление будет единым</strong><p>Тариф, устройства и история платежей появятся в одном безопасном кабинете.</p></div></li>
          </ol>
        </section>

        <section className="ara-subscription-download" aria-labelledby="subscription-download-title">
          <span aria-hidden="true"><Icon name="smartphone" size={25} /></span>
          <div>
            <h2 id="subscription-download-title">AraChat доступен в приложении</h2>
            <p>Веб-клиент временно закрыт. Перейдите на страницу загрузки, чтобы выбрать доступную версию приложения.</p>
          </div>
          <Link className="ara-button ara-button-primary" to="/download">К скачиванию <Icon name="arrowRight" size={17} /></Link>
        </section>

        <AraFooter />
      </div>
    </main>
  );
}
