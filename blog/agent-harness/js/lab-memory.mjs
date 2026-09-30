// Lessons 12–13: the same question through three retrieval paths; each answers a different kind of question well.
import {el, select, setup, wait} from './lab-ui.mjs';

const METHODS = [['grep', '关键词搜索', 'grep "clay" notes/*.md'], ['graph', '关系遍历', 'MATCH (v:Vendor {id:"clay"})-[*1..2]-(x)'], ['sql', '字段过滤', 'SELECT … ORDER BY updated DESC']];
const QUERIES = {
  quote: ['clay 现在的报价是多少？', {
    grep: ['partial', '命中 quote-clay-v1 和 quote-clay-v2 两份。哪份有效，还得再看版本和日期。'],
    graph: ['partial', 'clay → quotes 连出两份报价。图记录了关系，不自带“哪份最新”。'],
    sql: ['ok', '按 updated 倒序取第一条：quote-clay-v2，6800 元，10-03 到货。']}],
  owner: ['clay 供货的那个项目，负责人是谁？', {
    grep: ['miss', '笔记里没有一句话同时出现 clay 和负责人，关键词直接搜不到，要换别名再搜几轮。'],
    graph: ['ok', 'clay → 项目 ink-lab → 负责人 hao。两跳关系正是图擅长的，每条边都要能追到来源。'],
    sql: ['ok', 'JOIN vendor_project 与 project_owner 也能查到。关系一旦结构化，SQL 同样能做。']}],
  fresh: ['clay 最新的交期是哪天？', {
    grep: ['partial', '新旧两份报价都返回了，排在第一的不一定是最新的。'],
    graph: ['partial', '边上可以标有效期，但图本身不保证时效，要靠写入时维护。'],
    sql: ['ok', '按 updated 和 valid_until 过滤：quote-clay-v2，2026-10-03。']}]
};
const VERDICT = {ok: ['ok', '答得上'], partial: ['on', '要再核验'], miss: ['bad', '找不到']};

export function mount(root) {
  const {controls, stage, out} = setup(root, {
    title: '同一个问题，三种检索',
    dek: '记忆怎么存，决定了它能回答什么。换一个问题，看三种检索各自给出什么。',
    note: '检索结果是按固定的一小份笔记写好的，用来对比几种方法擅长的问题类型；它不说明哪种数据库总体更好。'
  });
  const q = select(controls, '问题', Object.entries(QUERIES).map(([k, [text]]) => [k, text]), () => show());
  const grid = el('div', null, stage, 'cards3');
  const cols = METHODS.map(([, name, cmd]) => {
    const c = el('div', null, grid, 'mini');
    el('h5', name, c);
    el('div', cmd, c, 'mono-box').style.fontSize = '11.5px';
    const badge = el('span', '', c, 'pill');
    badge.style.margin = '10px 0 6px';
    return {c, badge, text: el('p', '', c)};
  });
  async function show() {
    const [, answers] = QUERIES[q.value];
    for (const col of cols) { col.c.className = 'mini'; col.badge.textContent = '检索中…'; col.badge.className = 'pill'; col.text.textContent = ''; }
    for (const [i, [k]] of METHODS.entries()) {
      await wait(260);
      const [v, text] = answers[k], [cls, label] = VERDICT[v];
      cols[i].c.className = `mini ${cls}`;
      cols[i].badge.textContent = label; cols[i].badge.className = `pill ${cls}`;
      cols[i].text.textContent = text;
    }
    const best = METHODS.filter(([k]) => answers[k][0] === 'ok').map(([, n]) => n);
    out.replaceChildren(el('b', `适合这个问题的：${best.join('、')}。`, null, 'ok'),
      q.value === 'owner' ? ' 多跳关系是图的强项，但结构化以后 SQL 也能做。' : ' 带时间和版本的事实，靠字段过滤最稳；关键词和关系都得再核验一次。');
  }
  show();
}
