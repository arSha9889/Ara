import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { AraFooter } from '../components/AraFooter.jsx';
import { PublicSiteHeader } from '../components/PublicSiteHeader.jsx';

const PRODUCT_CODE_LINES = '26 486';

export function PresentationPage() {
  const { session } = useSession();
  const isAuthenticated = Boolean(session?.accessToken);
  const ctaPath = isAuthenticated ? '/app' : '/register';
  const ctaLabel = isAuthenticated ? 'Открыть AraChat' : 'Начать регистрацию';

  return (
    <main className="public-page ara-page ara-presentation-page" aria-labelledby="presentation-title">
      <div className="ara-shell ara-presentation-shell">
        <a className="ara-skip-link" href="#presentation-content">К содержанию</a>
        <PublicSiteHeader activePage="presentation" showLanguage={false} />

        <section className="ara-presentation-hero" id="presentation-content" tabIndex="-1">
          <div className="ara-presentation-hero-copy">
            <p className="ara-overline">Новый отечественный продукт</p>
            <h1 id="presentation-title">Не для всех сразу.<br /><em>Для тех, кто важен.</em></h1>
            <p>AraChat — новый отечественный мессенджер для семьи, друзей и небольшого круга людей, с которыми хочется быть по-настоящему рядом.</p>
            <div className="ara-actions">
              <Link to={ctaPath} className="ara-button ara-button-primary">{ctaLabel}<Icon name="arrowRight" size={18} /></Link>
              <a className="ara-button ara-button-secondary" href="#about">О проекте<Icon name="arrowRight" size={16} /></a>
            </div>
          </div>
          <div className="ara-circle-network" aria-hidden="true">
            <span className="ara-network-orbit ara-network-orbit-one" />
            <span className="ara-network-orbit ara-network-orbit-two" />
            <span className="ara-network-node ara-network-node-family">Семья</span>
            <span className="ara-network-node ara-network-node-friends">Друзья</span>
            <span className="ara-network-node ara-network-node-loved">Близкие</span>
            <span className="ara-network-core"><img src="/icons/arachat-parrot-icon-192.png" alt="" /></span>
            <span className="ara-network-note"><Icon name="chat" size={16} /><strong>Свой круг</strong><small>без лишнего шума</small></span>
          </div>
        </section>

        <section className="ara-editorial-section ara-presentation-positioning" id="about">
          <div className="ara-section-heading">
            <p className="ara-overline">01 — Фокус</p>
            <h2>Новый отечественный продукт для близкого круга.</h2>
          </div>
          <div className="ara-presentation-prose">
            <p className="ara-presentation-statement">AraChat не пытается заменить Telegram, WhatsApp или MAX для всех людей и всех задач.</p>
            <p>Большие мессенджеры соединяют страны, сообщества и целые экосистемы. Мы выбираем другой масштаб: личные разговоры с семьёй, друзьями, парой и теми, кто действительно важен.</p>
          </div>
        </section>

        <section className="ara-editorial-section" aria-labelledby="audience-title">
          <div className="ara-section-heading">
            <p className="ara-overline">02 — Контекст</p>
            <h2 id="audience-title">Мессенджеры уже стали привычной частью повседневного общения.</h2>
          </div>
          <div className="ara-audience-layout">
            <div className="ara-presentation-prose">
              <p>По графику за 2026 год Telegram особенно заметен в России — <strong>95,69 млн</strong> пользователей, Узбекистане — <strong>27 млн</strong> и Украине — <strong>24,5 млн</strong>.</p>
              <p>WhatsApp также остаётся важным каналом связи: на графике указаны <strong>80,3 млн</strong> пользователей в России, <strong>12,2 млн</strong> в Украине и <strong>6,5 млн</strong> в Узбекистане.</p>
              <p className="ara-inline-note"><Icon name="shield" size={18} />Аудитории сервисов нельзя складывать: один человек может пользоваться несколькими мессенджерами.</p>
            </div>
            <figure className="ara-audience-chart">
              <img src="/images/cis-messenger-audience-2026.png" alt="График аудитории Telegram и WhatsApp в России, Украине, Узбекистане, Казахстане, Беларуси и Кыргызстане за 2026 год." />
              <figcaption>График подготовлен для презентации. Значения отражают количество пользователей, указанное на графике.</figcaption>
            </figure>
          </div>
        </section>

        <section className="ara-editorial-section" aria-labelledby="references-title">
          <div className="ara-section-heading">
            <p className="ara-overline">03 — Ориентиры</p>
            <h2 id="references-title">Учимся у привычных мессенджеров, но создаём своё.</h2>
          </div>
          <div className="ara-reference-cards">
            <article><span>01</span><h3>Telegram</h3><p>Ориентир скорости, ясной структуры личных чатов и знакомого сценария общения.</p></article>
            <article><span>02</span><h3>WhatsApp</h3><p>Ориентир ежедневной связи с близкими — короткой, простой и всегда уместной.</p></article>
            <article><span>03</span><h3>MAX</h3><p>Ориентир развития локального российского мессенджера и самостоятельного продукта для своего контекста.</p></article>
          </div>
          <p className="ara-reference-conclusion">AraChat не копирует эти сервисы и не повторяет их масштаб, экосистемные или государственные сценарии. Для нас важнее сделать личное общение бережным, понятным и своим.</p>
        </section>

        <section className="ara-circle-section" aria-labelledby="circle-title">
          <div className="ara-section-heading">
            <p className="ara-overline">04 — Свой круг</p>
            <h2 id="circle-title">Меньше шума. Больше места для тех, кто рядом.</h2>
            <p>Это не лента и не бесконечный поток каналов. AraChat задуман для небольшого числа людей, чьи сообщения хочется видеть, слышать и не терять.</p>
            <ul className="ara-circle-list">
              <li><Icon name="user" size={18} /><span><strong>Семья</strong> — чтобы быть рядом, даже если вы далеко.</span></li>
              <li><Icon name="chat" size={18} /><span><strong>Друзья</strong> — для разговоров, которые продолжаются годами.</span></li>
              <li><Icon name="sparkles" size={18} /><span><strong>Близкие</strong> — для своего спокойного пространства.</span></li>
            </ul>
          </div>
          <div className="ara-circle-visual" aria-hidden="true">
            <span className="ara-circle-ring ara-circle-ring-outer" />
            <span className="ara-circle-ring ara-circle-ring-inner" />
            <span className="ara-circle-person ara-circle-person-one">А</span>
            <span className="ara-circle-person ara-circle-person-two">М</span>
            <span className="ara-circle-person ara-circle-person-three">К</span>
            <span className="ara-circle-person ara-circle-person-four">И</span>
            <span className="ara-circle-core"><Icon name="chat" size={29} /></span>
          </div>
        </section>

        <section className="ara-editorial-section" aria-labelledby="build-title">
          <div className="ara-section-heading">
            <p className="ara-overline">05 — Уже создаётся</p>
            <h2 id="build-title">Не только идея — работающий продукт, который развивается шаг за шагом.</h2>
          </div>
          <div className="ara-build-grid">
            <article className="ara-code-card">
              <span aria-hidden="true"><Icon name="activity" size={21} /></span>
              <strong>{PRODUCT_CODE_LINES}</strong>
              <small>строк прикладного кода</small>
              <p>Веб-клиент и серверная часть AraChat — без зависимостей, сборки, документации, миграций и переводов.</p>
            </article>
            <ol className="ara-roadmap">
              <li><span><Icon name="check" size={17} /></span><div><small>Сейчас</small><strong>Личные чаты и обмен важным</strong><p>Текст, фото, видео, файлы, голосовые сообщения, статусы и уведомления.</p></div></li>
              <li><span><Icon name="activity" size={17} /></span><div><small>Развитие</small><strong>Надёжный realtime-опыт</strong><p>Синхронизация, живые статусы и всё более удобный сценарий общения.</p></div></li>
              <li><span><Icon name="sparkles" size={17} /></span><div><small>Дальше</small><strong>Desktop и mobile</strong><p>Развитие AraChat как привычного приложения на разных устройствах.</p></div></li>
            </ol>
          </div>
          <aside className="ara-ai-note" aria-labelledby="ai-development-title">
            <span aria-hidden="true"><Icon name="sparkles" size={21} /></span>
            <div>
              <p className="ara-overline">Подход к разработке</p>
              <h3 id="ai-development-title">Грамотный вайб-кодинг — с инженерной проверкой.</h3>
              <p>AraChat создаётся с применением Claude, Gemini и Qwen. AI-инструменты ускоряют работу над кодом, архитектурой, тестированием и интерфейсом, а ключевые решения проходят проверку перед интеграцией в продукт.</p>
            </div>
            <ul aria-label="AI-инструменты разработки"><li>Claude</li><li>Gemini</li><li>Qwen</li></ul>
          </aside>
        </section>

        <section className="ara-final ara-presentation-final">
          <span className="ara-final-icon" aria-hidden="true"><Icon name="sparkles" size={23} /></span>
          <p className="ara-overline">AraChat</p>
          <h2>Оставайтесь на связи с теми, кто важен.</h2>
          <p>Начните с личного разговора — спокойно, просто и в своём круге.</p>
          <div className="ara-actions">
            <Link to={ctaPath} className="ara-button ara-button-primary">{ctaLabel}<Icon name="arrowRight" size={18} /></Link>
            {!isAuthenticated ? <Link to="/login" className="ara-button ara-button-secondary">Войти</Link> : null}
          </div>
        </section>

        <AraFooter />
      </div>
    </main>
  );
}
