/* Conteúdo do portfólio + definição dos andares (cada seção = um andar mais fundo) */
const G = 'https://github.com/Alexandregv1080p';

export const ABOUT = [
  'Olá, sou o Alexandre, desenvolvedor Full Stack baseado em Alfenas, Brasil, trabalhando remotamente com equipes ao redor do mundo.',
  'Meu foco está no encontro entre criatividade e proficiência técnica — transformar ideias em interfaces fluidas, bem estruturadas e experiências memoráveis.',
  'Atualmente construo a plataforma SaaS de digital signage da Spotside (microsserviços em Node.js, MongoDB, Socket.io, Electron), e desenvolvo projetos Angular/Kotlin na CroSoften.',
  'Atuo em toda a stack — React, Next.js e Angular no front-end, Node.js e Java/Spring no back-end — sempre com código limpo, testes e CI/CD em mente.',
  'Formado em Ciências da Computação, com certificações em Java, Spring Boot e React. Objetivo: evoluir para Full Stack Sênior.',
];

export const JOBS = [
  { date: 'Out 2025 — Atual', role: 'Desenvolvedor Full Stack', co: '@ Spotside · Portugal (Remoto)', desc: 'Plataforma SaaS de digital signage com arquitetura de microsserviços, gerenciando conteúdo e dispositivos de exibição em tempo real.' },
  { date: 'Fev 2026 — Atual', role: 'Desenvolvedor Angular / Front-end', co: '@ CroSoften', desc: 'Projetos front-end (CRUDs) em Angular e apps Android em Kotlin: app bancário, sistema gerencial de farmácias e lojas virtuais.' },
  { date: 'Mar 2025 — Jul 2025', role: 'Desenvolvedor Full Stack', co: '@ Play2Sell', desc: 'Aplicações com Angular no front-end e Node.js (TypeScript) no back-end, incluindo automações em low code com N8N e GPT Maker.' },
  { date: 'Out 2023 — Jan 2025', role: 'Desenvolvedor Júnior Full Stack', co: '@ Postaqui Logística', desc: 'Desenvolvimento full stack com ReactJS/NextJS e Node.js, com foco em qualidade de código, testes e entregas contínuas. Criação do site institucional e novas telas.' },
  { date: '2022', role: 'Desenvolvedor Estagiário', co: '@ A2W Tecnologia e Inovações', desc: 'Desenvolvimento front-end com Angular, consumo de APIs REST e prototipação no Figma, em metodologia Scrum.' },
];

const ADV = 'Avançado', MID = 'Intermediário';
export const RACKS = [
  { name: 'srv-01 · front-end', list: [['Angular / TypeScript', 92, ADV], ['React / Next.js', 88, ADV], ['Vue 3 / Pinia', 68, MID], ['HTML5 / CSS3 / Tailwind', 88, ADV]] },
  { name: 'srv-02 · back-end', list: [['Node.js / NestJS / Express', 88, ADV], ['Java / Spring Boot', 85, ADV], ['.NET / C#', 68, MID], ['PHP / Laravel', 62, MID]] },
  { name: 'srv-03 · mobile & devops', list: [['Kotlin / Android', 82, ADV], ['React Native / Expo', 66, MID], ['PostgreSQL / MySQL / MongoDB', 72, MID], ['Docker / Git / CI-CD', 85, ADV]] },
  { name: 'certs.log', body: ['Bootcamp Banco PAN — Java Dev (DIO, 2023)', 'React + Redux do Absoluto Zero (Udemy, 2025)'] },
];

export const PROJECTS = [
  { name: 'Browser Engine', cat: 'SYSTEMS', stack: 'C++ · HTML/CSS parser · layout · rendering', url: G, desc: 'Navegador construído do zero em C++ — parser de HTML/CSS, árvore de layout e motor de renderização próprios.' },
  { name: 'SO · Raspberry Pi', cat: 'SYSTEMS', stack: 'C · Assembly · bare-metal', url: G, desc: 'Sistema operacional bare-metal do zero para Raspberry Pi: boot, gerência de memória e I/O escritos à mão.' },
  { name: 'Dev Codex', cat: 'FULLSTACK', stack: '.NET 8 · Vue 3 · Kotlin · PostgreSQL · SignalR', url: G + '/Dev-Codex', desc: 'Plataforma de cursos online com web em Vue 3, app Android em Kotlin e painel admin. Chat em tempo real via SignalR, CI/CD e Terraform.' },
  { name: 'MinX', cat: 'FULLSTACK', stack: 'NestJS · Next.js · MySQL · Redis · AWS SQS/Lambda', url: G + '/MinX', desc: 'Rede social estilo Twitter com API NestJS modular, fanout assíncrono da timeline via SQS + Lambda e deploy em Kubernetes.' },
  { name: 'Fast Trade', cat: 'FULLSTACK', stack: 'Java · Spring Boot · Angular 17 · Kotlin', url: G + '/Fast-Trade', desc: 'Marketplace de compra, venda e troca: JWT, chat em tempo real (WebSocket STOMP), painel Angular e app Android em Compose.' },
  { name: 'Pagamentos API', cat: 'API', stack: '.NET 8 · Angular 17 · RabbitMQ · SignalR', url: G + '/PagamentosApi', desc: 'Pagamentos assíncronos com RabbitMQ (consumo idempotente, retry com TTL e DLQ), tempo real por SignalR e testes.' },
  { name: 'Agenda Atenta', cat: 'WEB', stack: 'Laravel 13 · PHP · MySQL · Web Push', url: G + '/Agenda-Atenta', desc: 'Organizador de rotinas semanais com arrastar-e-soltar, recorrência, anotações em Markdown e notificações via Web Push.' },
  { name: 'Eventus', cat: 'WEB', stack: 'Angular 21 · Signals · Bootstrap 5', url: G + '/Eventus', desc: 'Marketplace do ecossistema de eventos: SPA em Angular 21 (zoneless, signals) com múltiplos perfis e API desacoplada.' },
];

/* ---- andares ----
   look: texturas/tons do cenário · env: atmosfera (névoa, grade de cor, glitch, tremor) · fear: 0..1 usado pelos sustos e pelo áudio */
export const ZONES = [
  { id: 'lobby', floor: '0', name: 'RECEPÇÃO', n: 0, len: 24, fear: 0.0,
    look: { wall: ['wall', 0x9a918a, 2.6], floor: ['floor', 0x6f666a, 1.4, 0.7], ceil: ['ceil', 0x6f6a6e, 2], lamp: 0xffe6c8, lampI: 2.2 },
    env: { fog: 0x0e0c0a, fogD: 0.045, amb: 0x2a2220, ambI: 0.1, tint: [1.03, 1, 0.95], sat: 1, glitch: 0, shake: 0, fov: 66, bad: 0.1, emerg: 0 } },
  { id: 'sobre', floor: '-1', name: 'ESCRITÓRIOS', n: 5, fear: 0.2,
    look: { wall: ['wall', 0x748188, 2.6], floor: ['ceil', 0x555860, 2, 0.8], ceil: ['ceil', 0x555a62, 2], lamp: 0xcfe8ff, lampI: 2.0 },
    env: { fog: 0x0a1013, fogD: 0.062, amb: 0x1a2830, ambI: 0.1, tint: [0.94, 1, 1.04], sat: 0.9, glitch: 0.05, shake: 0, fov: 66, bad: 0.3, emerg: 0 } },
  { id: 'exp', floor: '-2', name: 'ARQUIVO', n: 5, fear: 0.4,
    look: { wall: ['floor', 0x8aa090, 1.6], floor: ['floor', 0x56685a, 1.4, 0.55], ceil: ['ceil', 0x5f6862, 2], lamp: 0xcdf5d0, lampI: 3.0 },
    env: { fog: 0x09100b, fogD: 0.065, amb: 0x16261a, ambI: 0.12, tint: [0.93, 1.05, 0.92], sat: 0.78, glitch: 0.12, shake: 0, fov: 67, bad: 0.55, emerg: 0 } },
  { id: 'skills', floor: '-3', name: 'SALA DE SERVIDORES', n: 4, fear: 0.6,
    look: { wall: ['metal', 0x6f7c88, 1.6], floor: ['metal', 0x3c444c, 1.4], ceil: ['ceil', 0x4a5058, 2], lamp: 0x6fd8ff, lampI: 2.6 },
    env: { fog: 0x061018, fogD: 0.065, amb: 0x10283a, ambI: 0.14, tint: [0.88, 1, 1.1], sat: 1.05, glitch: 0.22, shake: 0.1, fov: 68, bad: 0.4, emerg: 0 } },
  { id: 'proj', floor: '-4', name: 'LABORATÓRIO', n: 8, fear: 0.8,
    look: { wall: ['ceil', 0x7a4040, 2.2], floor: ['floor', 0x4a2a2a, 1.4, 0.4], ceil: ['ceil', 0x3a2020, 2], lamp: 0xff6a4a, lampI: 2.2 },
    env: { fog: 0x1a0708, fogD: 0.075, amb: 0x3a0e0e, ambI: 0.15, tint: [1.1, 0.92, 0.9], sat: 0.95, glitch: 0.38, shake: 0.25, fov: 71, bad: 0.7, emerg: 16 } },
  { id: 'end', floor: '-5', name: 'O ABISMO', n: 1, len: 18, fear: 1.0,
    look: { wall: ['ceil', 0x3a1818, 2.2], floor: ['floor', 0x300606, 1.4, 0.22], ceil: ['ceil', 0x1a0a0a, 2], lamp: 0xff2a1a, lampI: 1.3 },
    env: { fog: 0x240a0b, fogD: 0.085, amb: 0x4a1010, ambI: 0.17, tint: [1.1, 0.88, 0.86], sat: 0.8, glitch: 0.6, shake: 0.55, fov: 77, bad: 0.9, emerg: 28 } },
];
