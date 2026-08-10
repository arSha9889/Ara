import { Link } from 'react-router-dom';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';
import { Icon } from '../../../shared/ui/Icon.jsx';

const PRODUCT_CODE_LINES = '26 486';

export function PresentationPage() {
  const { session } = useSession();
  const isAuthenticated = Boolean(session?.accessToken);
  const ctaPath = isAuthenticated ? '/app' : '/register';
  const ctaLabel = isAuthenticated ? 'Открыть AraChat' : 'Начать регистрацию';

  return (
    <main className="presentation-page" aria-labelledby="presentation-title">
      <div className="presentation-shell">
        <header className="presentation-topbar">
          <Link to="/" className="brand compact"><img className="brand-mark" src="/icons/arachat-parrot-icon-192.png" alt="" aria-hidden="true" /><span>AraChat</span></Link>
          <nav className="presentation-nav" aria-label="Навигация лендинга">
            <Link to="/">Главная</Link>
            <Link to="/presentation" aria-current="page">Презентация</Link>
          </nav>
          <div className="presentation-topbar-actions">
            <ThemeSwitcher />
            {!isAuthenticated ? <Link to="/login" className="presentation-login-link">Войти</Link> : null}
          </div>
        </header>

        <section className="presentation-hero">
          <div className="presentation-hero-copy">
            <p className="eyebrow presentation-eyebrow"><span aria-hidden="true" />Новый отечественный продукт</p>
            <h1 id="presentation-title">Не для всех сразу.<br /><em>Для тех, кто важен.</em></h1>
            <p className="presentation-lead">AraChat — новый отечественный мессенджер для семьи, друзей и небольшого круга людей, с которыми хочется быть по-настоящему рядом.</p>
            <div className="stack presentation-actions">
              <Link to={ctaPath} className="button button-primary">{ctaLabel}<Icon name="arrowRight" size={18} /></Link>
              <a className="presentation-text-link" href="#about">О проекте <Icon name="arrowRight" size={16} /></a>
            </div>
          </div>
          <div className="presentation-hero-art" aria-hidden="true">
            <div className="presentation-halo halo-one" />
            <div className="presentation-halo halo-two" />
            <div className="presentation-network">
              <i className="presentation-network-line line-one" />
              <i className="presentation-network-line line-two" />
              <i className="presentation-network-line line-three" />
              <span className="presentation-network-node node-family">Семья</span>
              <span className="presentation-network-node node-friends">Друзья</span>
              <span className="presentation-network-node node-loved">Близкие</span>
              <span className="presentation-network-core"><img src="/icons/arachat-parrot-icon-192.png" alt="" /></span>
            </div>
            <div className="presentation-hero-note"><span><Icon name="chat" size={17} /></span><strong>Свой круг</strong><small>без лишнего шума</small></div>
          </div>
        </section>

        <section className="presentation-section presentation-positioning" id="about">
          <div className="presentation-section-intro">
            <p className="eyebrow">01 — Фокус</p>
            <h2>Новый отечественный продукт для близкого круга.</h2>
          </div>
          <div className="presentation-positioning-copy">
            <p className="presentation-statement">AraChat не пытается заменить Telegram, WhatsApp или MAX для всех людей и всех задач.</p>
            <p>Большие мессенджеры соединяют страны, сообщества и целые экосистемы. Мы выбираем другой масштаб: личные разговоры с семьёй, друзьями, парой и теми, кто действительно важен.</p>
          </div>
        </section>

        <section className="presentation-section presentation-audience-section" aria-labelledby="audience-title">
          <div className="presentation-section-intro">
            <p className="eyebrow">02 — Контекст</p>
            <h2 id="audience-title">Мессенджеры уже стали привычной частью повседневного общения.</h2>
          </div>
          <div className="presentation-audience-layout">
            <div className="presentation-audience-copy">
              <p>По графику за 2026 год Telegram особенно заметен в России — <strong>95,69 млн</strong> пользователей, Узбекистане — <strong>27 млн</strong> и Украине — <strong>24,5 млн</strong>.</p>
              <p>WhatsApp также остаётся важным каналом связи: на графике указаны <strong>80,3 млн</strong> пользователей в России, <strong>12,2 млн</strong> в Украине и <strong>6,5 млн</strong> в Узбекистане.</p>
              <div className="presentation-note"><Icon name="shield" size={18} /><p>Аудитории сервисов нельзя складывать: один человек может пользоваться несколькими мессенджерами.</p></div>
            </div>
            <figure className="presentation-chart">
              <img src="/images/cis-messenger-audience-2026.png" alt="График аудитории Telegram и WhatsApp в России, Украине, Узбекистане, Казахстане, Беларуси и Кыргызстане за 2026 год." />
              <figcaption>График подготовлен для презентации. Значения отражают количество пользователей, указанное на графике.</figcaption>
            </figure>
          </div>
        </section>

        <section className="presentation-section presentation-reference-section" aria-labelledby="references-title">
          <div className="presentation-section-intro">
            <p className="eyebrow">03 — Ориентиры</p>
            <h2 id="references-title">Учимся у привычных мессенджеров, но создаём своё.</h2>
          </div>
          <div className="presentation-reference-cards">
            <article className="presentation-reference-card telegram">
              <span className="presentation-reference-number">01</span>
              <h3>Telegram</h3>
              <p>Ориентир скорости, ясной структуры личных чатов и знакомого сценария общения.</p>
            </article>
            <article className="presentation-reference-card whatsapp">
              <span className="presentation-reference-number">02</span>
              <h3>WhatsApp</h3>
              <p>Ориентир ежедневной связи с близкими — короткой, простой и всегда уместной.</p>
            </article>
            <article className="presentation-reference-card max">
              <span className="presentation-reference-number">03</span>
              <h3>MAX</h3>
              <p>Ориентир развития локального российского мессенджера и самостоятельного продукта для своего контекста.</p>
            </article>
          </div>
          <p className="presentation-reference-conclusion">AraChat не копирует эти сервисы и не повторяет их масштаб, экосистемные или государственные сценарии. Для нас важнее сделать личное общение бережным, понятным и своим.</p>
        </section>

        <section className="presentation-section presentation-circle-section" aria-labelledby="circle-title">
          <div className="presentation-circle-copy">
            <p className="eyebrow">04 — Свой круг</p>
            <h2 id="circle-title">Меньше шума. Больше места для тех, кто рядом.</h2>
            <p>Это не лента и не бесконечный поток каналов. AraChat задуман для небольшого числа людей, чьи сообщения хочется видеть, слышать и не терять.</p>
            <ul className="presentation-circle-list">
              <li><Icon name="user" size={18} /><span><strong>Семья</strong> — чтобы быть рядом, даже если вы далеко.</span></li>
              <li><Icon name="chat" size={18} /><span><strong>Друзья</strong> — для разговоров, которые продолжаются годами.</span></li>
              <li><Icon name="sparkles" size={18} /><span><strong>Близкие</strong> — для своего спокойного пространства.</span></li>
            </ul>
          </div>
          <div className="presentation-circle-visual" aria-hidden="true">
            <span className="presentation-circle-ring ring-outer" />
            <span className="presentation-circle-ring ring-inner" />
            <span className="presentation-circle-person person-one">А</span>
            <span className="presentation-circle-person person-two">М</span>
            <span className="presentation-circle-person person-three">К</span>
            <span className="presentation-circle-person person-four">И</span>
            <span className="presentation-circle-core"><Icon name="chat" size={29} /></span>
          </div>
        </section>

        <section className="presentation-section presentation-build-section" aria-labelledby="build-title">
          <div className="presentation-section-intro">
            <p className="eyebrow">05 — Уже создаётся</p>
            <h2 id="build-title">Не только идея — работающий продукт, который развивается шаг за шагом.</h2>
          </div>
          <div className="presentation-build-grid">
            <div className="presentation-code-card">
              <span className="presentation-code-icon"><Icon name="activity" size={21} /></span>
              <strong>{PRODUCT_CODE_LINES}</strong>
              <span>строк прикладного кода</span>
              <p>Веб-клиент и серверная часть AraChat — без зависимостей, сборки, документации, миграций и переводов.</p>
            </div>
            <div className="presentation-roadmap">
              <article><span><Icon name="check" size={17} /></span><div><small>Сейчас</small><strong>Личные чаты и обмен важным</strong><p>Текст, фото, видео, файлы, голосовые сообщения, статусы и уведомления.</p></div></article>
              <article><span><Icon name="activity" size={17} /></span><div><small>Развитие</small><strong>Надёжный realtime-опыт</strong><p>Синхронизация, живые статусы и всё более удобный сценарий общения.</p></div></article>
              <article><span><Icon name="sparkles" size={17} /></span><div><small>Дальше</small><strong>Desktop и mobile</strong><p>Развитие AraChat как привычного приложения на разных устройствах.</p></div></article>
            </div>
          </div>
          <aside className="presentation-ai-note" aria-labelledby="ai-development-title">
            <span className="presentation-ai-note-icon"><Icon name="sparkles" size={21} /></span>
            <div>
              <p className="eyebrow">Подход к разработке</p>
              <h3 id="ai-development-title">Грамотный вайб-кодинг — с инженерной проверкой.</h3>
              <p>AraChat создаётся с применением Claude, Gemini и Qwen. AI-инструменты ускоряют работу над кодом, архитектурой, тестированием и интерфейсом, а ключевые решения проходят проверку перед интеграцией в продукт.</p>
            </div>
            <ul aria-label="AI-инструменты разработки">
              <li>Claude</li>
              <li>Gemini</li>
              <li>Qwen</li>
            </ul>
          </aside>
        </section>

        <section className="presentation-final">
          <span className="presentation-final-icon"><Icon name="sparkles" size={23} /></span>
          <p className="eyebrow">AraChat</p>
          <h2>Оставайтесь на связи с теми, кто важен.</h2>
          <p>Начните с личного разговора — спокойно, просто и в своём круге.</p>
          <div className="stack presentation-final-actions">
            <Link to={ctaPath} className="button button-primary">{ctaLabel}<Icon name="arrowRight" size={18} /></Link>
            {!isAuthenticated ? <Link to="/login" className="button button-secondary">Войти</Link> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
