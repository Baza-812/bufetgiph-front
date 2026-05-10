import registerPdPolicyBody from './registerPdPolicyBody.json';

/** Текст политики: `registerPdPolicyBody.json` (поле `text`). Плейсхолдер __OPERATOR_PD__; URL https://orders.baza.menu подменяется из Organizations.Domain. */

const DEFAULT_SITE = 'https://orders.baza.menu';

/** Длинные тире и дефисы Unicode — в короткий "-". */
export function shortHyphens(s: string): string {
  return s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
}

/** Базовый URL сайта для подстановки в юр. тексты (из Organizations.Domain). */
export function normalizeSiteUrl(domainRaw: string): string {
  const t = String(domainRaw || '').trim();
  if (!t) return DEFAULT_SITE;
  if (/^https?:\/\//i.test(t)) return t.replace(/\/+$/, '');
  return `https://${t.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function substitutePolicySites(policy: string, siteNoSlash: string): string {
  const slash = `${siteNoSlash}/`;
  return policy
    .split('https://orders.baza.menu/')
    .join(slash)
    .split('https://orders.baza.menu')
    .join(siteNoSlash);
}

const CONSENT_LINES = [
  'Оператор: __OPERATOR__',
  '',
  'Собираемые данные: фамилия, имя, email, организация, сведения о заказах, IP.',
  'Цель обработки: регистрация сотрудника, создание персональной ссылки, оформление/изменение/отмена заказов, сервисные уведомления, формирование отчетов по питанию для организации.',
  'Действия с ПДн: сбор, запись, систематизация, накопление, хранение, уточнение, использование, передача/предоставление, обезличивание, блокирование, удаление, уничтожение.',
  'Кому могут передаваться данные: вашей организации-заказчику в пределах отчетов по питанию, техническим подрядчикам - сервис email-рассылки, платежный провайдер.',
  'Срок действия согласия: до удаления учетной записи/прекращения использования сервиса или до отзыва согласия, если нет иных законных оснований для хранения.',
  'Как отозвать согласие: отправить письмо на reg@baza.menu.',
  'Что будет при отказе: сотрудник не сможет зарегистрироваться и получить персональную ссылку для заказов.',
].join('\n');

export function buildConsentText(operatorPd: string): string {
  const op = String(operatorPd || '').trim() || 'сведения не указаны в карточке организации';
  return shortHyphens(CONSENT_LINES.replace('__OPERATOR__', op));
}

export function buildPolicyText(operatorPd: string, domainRaw: string): string {
  const op = String(operatorPd || '').trim() || 'сведения не указаны в карточке организации';
  const site = normalizeSiteUrl(domainRaw);
  let body = String(registerPdPolicyBody.text || '');
  body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  body = body.split('__OPERATOR_PD__').join(op);
  body = substitutePolicySites(body, site);
  return shortHyphens(body);
}
