#!/usr/bin/env node
// Controllo di attribuzione: una PR non deve attribuire il lavoro a un assistente AI.
// Uso in CI:  PR_TITLE=… PR_BODY=… node scripts/attribution.js BASE HEAD
// Controlla (senza distinguere maiuscole) messaggio, autore e committer di ogni commit
// di BASE..HEAD, più titolo e corpo della PR. Esce 1 se trova qualcosa.
// I nomi sono composti a pezzi perché questo file non deve contenerli per intero.
'use strict';
const { execFileSync } = require('node:child_process');

const j = (...p) => p.join('');
// Assistenti AI e relativi produttori.
const NOMI = [
	j('cla', 'ude'),
	j('anthro', 'pic'),
	j('chat', 'gpt'),
	j('open', 'ai'),
	j('co', 'pilot'),
	j('gem', 'ini'),
	j('co', 'dex'),
	j('ai', 'der'),
];
const NOMI_RE = NOMI.join('|');

const REGOLE = [
	{
		descrizione: 'trailer di co-autore che nomina un assistente AI o il suo produttore',
		re: new RegExp(
			`^[ \\t]*co-authored-by:.*(?:${NOMI_RE}|noreply@${j('anthro', 'pic')}\\.com)`,
			'im',
		),
	},
	{
		descrizione: 'trailer o link di sessione di uno strumento di codifica AI',
		re: new RegExp(
			`^[ \\t]*[a-z-]*session[a-z-]*:[ \\t]*\\S*(?:${NOMI_RE}|cursor)|(?:${j('cla', 'ude')}\\.ai|cursor\\.com|${j('chat', 'gpt')}\\.com)/\\S*(?:code|session|agents?|tasks?)/?\\S*`,
			'im',
		),
	},
	{
		descrizione: 'frase «generated/written/created/assisted by/with» seguita da un assistente AI',
		re: new RegExp(
			`\\b(?:generated|written|created|assisted|authored|made|built|co-authored)\\s+(?:with|by)\\s+[\\[*_\`(]{0,3}\\s*(?:${NOMI_RE})`,
			'i',
		),
	},
	{
		descrizione: 'emoji del robot',
		re: /\u{1F916}/u,
	},
];

const IDENTITA_RE = new RegExp(NOMI_RE, 'i');

// Ritorna l'elenco dei problemi ("dove: regola") di una PR.
// pr = { title, body, commits: [{ sha, message, authorName, authorEmail, committerName, committerEmail }] }
function controlla(pr) {
	const problemi = [];
	const testo = (dove, s) => {
		for (const r of REGOLE) if (r.re.test(s || '')) problemi.push(`${dove}: ${r.descrizione}`);
	};
	testo('titolo della PR', pr.title);
	testo('corpo della PR', pr.body);
	for (const c of pr.commits || []) {
		const id = `commit ${String(c.sha || '?').slice(0, 10)}`;
		testo(`${id} (messaggio)`, c.message);
		for (const [ruolo, nome, email] of [
			['autore', c.authorName, c.authorEmail],
			['committer', c.committerName, c.committerEmail],
		]) {
			if (IDENTITA_RE.test(nome || '') || IDENTITA_RE.test(email || '')) {
				problemi.push(`${id}: ${ruolo} il cui nome o email contiene il nome di un assistente AI o del suo produttore`);
			}
		}
	}
	return problemi;
}

function commitsDa(base, head) {
	const out = execFileSync(
		'git',
		['log', '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e', `${base}..${head}`],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	);
	return out
		.split('\x1e')
		.map((s) => s.replace(/^\n/, ''))
		.filter((s) => s.trim())
		.map((s) => {
			const [sha, authorName, authorEmail, committerName, committerEmail, message] = s.split('\x1f');
			return { sha, authorName, authorEmail, committerName, committerEmail, message };
		});
}

function main(argv, env) {
	const [base, head] = argv;
	if (!base || !head) {
		console.error("uso: node scripts/attribution.js BASE HEAD (PR_TITLE e PR_BODY nell'ambiente)");
		return 2;
	}
	const problemi = controlla({ title: env.PR_TITLE, body: env.PR_BODY, commits: commitsDa(base, head) });
	if (problemi.length === 0) {
		console.log('attribution: nessuna attribuzione trovata');
		return 0;
	}
	for (const p of problemi) console.error(`attribution: ${p}`);
	return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2), process.env));

module.exports = { controlla };
