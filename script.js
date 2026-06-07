// Translation dictionary (PT / EN) and language switcher
const I18N = {
  'hero.greeting': { pt: 'Olá, eu sou', en: "Hi, I'm" },
  'hero.title': {
    pt: 'Alexandre, um <span class="accent">full&nbsp;stack</span><br>developer',
    en: 'Alexandre, a <span class="accent">full&nbsp;stack</span><br>developer'
  },
  'hero.sub': {
    pt: 'Desenvolvo produtos web de ponta a ponta — unindo front-end, back-end e arquitetura de microsserviços com precisão técnica e atenção ao detalhe.',
    en: 'I build web products end-to-end — bringing together front-end, back-end and microservices architecture with technical precision and attention to detail.'
  },
  'hero.cta_projects': { pt: 'Ver projetos', en: 'View projects' },
  'hero.cta_talk': { pt: 'Vamos conversar', en: "Let's talk" },
  'hero.location': { pt: 'Alfenas, Brasil', en: 'Alfenas, Brazil' },
  'hero.lets_work': {
    pt: "let's-work-together <i class=\"fa-solid fa-arrow-right\"></i>",
    en: "let's-work-together <i class=\"fa-solid fa-arrow-right\"></i>"
  },

  'about.title': { pt: 'Sobre mim', en: 'About me' },
  'about.drag_hint': { pt: 'arraste as janelas para reorganizar', en: 'drag the windows to rearrange them' },
  'about.p1': {
    pt: 'Olá, sou o <strong class="accent">Alexandre</strong>, desenvolvedor Full Stack baseado em Alfenas, Brasil, trabalhando remotamente com equipes ao redor do mundo.',
    en: "Hi, I'm <strong class=\"accent\">Alexandre</strong>, a Full Stack developer based in Alfenas, Brazil, working remotely with teams around the world."
  },
  'about.p2': {
    pt: 'Meu foco está no encontro entre criatividade e proficiência técnica — transformar ideias em interfaces fluidas, bem estruturadas e experiências memoráveis.',
    en: 'My focus sits at the intersection of creativity and technical proficiency — turning ideas into fluid, well-structured interfaces and memorable experiences.'
  },
  'about.p3': {
    pt: 'Atualmente construo a plataforma SaaS de digital signage da <strong class="accent">Spotside</strong> (microsserviços em Node.js, MongoDB, Socket.io, Electron), e desenvolvo projetos Angular/Kotlin na <strong class="accent">CroSoften</strong>.',
    en: "I'm currently building <strong class=\"accent\">Spotside</strong>'s digital signage SaaS platform (Node.js microservices, MongoDB, Socket.io, Electron), and developing Angular/Kotlin projects at <strong class=\"accent\">CroSoften</strong>."
  },
  'about.p4': {
    pt: 'Atuo em toda a stack — React, Next.js e Angular no front-end, Node.js e Java/Spring no back-end — sempre com código limpo, testes e CI/CD em mente.',
    en: 'I work across the whole stack — React, Next.js and Angular on the front-end, Node.js and Java/Spring on the back-end — always keeping clean code, testing and CI/CD in mind.'
  },
  'about.p5': {
    pt: 'Formado em Ciências da Computação, com certificações em Java, Spring Boot e React. Objetivo: evoluir para Full Stack Sênior.',
    en: 'Computer Science graduate, certified in Java, Spring Boot and React. Goal: grow into a Senior Full Stack role.'
  },
  'about.where1': { pt: 'Atualmente em Alfenas, Brasil', en: 'Currently in Alfenas, Brazil' },
  'about.where2': { pt: 'Disponível para colaborações remotas em todo o mundo', en: 'Available for remote collaborations worldwide' },
  'about.resume': { pt: 'currículo', en: 'resume' },
  'about.education': { pt: 'Ciências da Computação · Estácio', en: 'Computer Science · Estácio' },
  'about.available': { pt: 'Disponível para novos projetos', en: 'Available for new projects' },

  'exp.title': { pt: 'Trajetória profissional', en: 'Professional journey' },
  'exp.live': { pt: 'ao vivo', en: 'live' },
  'exp.date1': { pt: 'Out 2025 — Atual', en: 'Oct 2025 — Present' },
  'exp.date2': { pt: 'Fev 2026 — Atual', en: 'Feb 2026 — Present' },
  'exp.date3': { pt: 'Mar 2025 — Jul 2025', en: 'Mar 2025 — Jul 2025' },
  'exp.date4': { pt: 'Out 2023 — Jan 2025', en: 'Oct 2023 — Jan 2025' },
  'exp.date5': { pt: '2022', en: '2022' },
  'exp.role1': { pt: 'Desenvolvedor Full Stack', en: 'Full Stack Developer' },
  'exp.company1': { pt: '@ Spotside · Portugal (Remoto)', en: '@ Spotside · Portugal (Remote)' },
  'exp.role2': { pt: 'Desenvolvedor Angular / Front-end', en: 'Angular / Front-end Developer' },
  'exp.company2': { pt: '@ CroSoften', en: '@ CroSoften' },
  'exp.role3': { pt: 'Desenvolvedor Full Stack', en: 'Full Stack Developer' },
  'exp.company3': { pt: '@ Play2Sell', en: '@ Play2Sell' },
  'exp.role4': { pt: 'Desenvolvedor Júnior Full Stack', en: 'Junior Full Stack Developer' },
  'exp.company4': { pt: '@ Postaqui Logística', en: '@ Postaqui Logística' },
  'exp.role5': { pt: 'Desenvolvedor Estagiário', en: 'Intern Developer' },
  'exp.company5': { pt: '@ A2W Tecnologia e Inovações', en: '@ A2W Tecnologia e Inovações' },
  'exp.desc1': {
    pt: 'Plataforma SaaS de digital signage com arquitetura de microsserviços, gerenciando conteúdo e dispositivos de exibição em tempo real.',
    en: 'Digital signage SaaS platform with a microservices architecture, managing content and display devices in real time.'
  },
  'exp.desc2': {
    pt: 'Projetos front-end (CRUDs) em Angular e apps Android em Kotlin: app bancário, sistema gerencial de farmácias e lojas virtuais.',
    en: 'Front-end CRUD projects in Angular and Android apps in Kotlin: a banking app, a pharmacy management system and online stores.'
  },
  'exp.desc3': {
    pt: 'Aplicações com Angular no front-end e Node.js (TypeScript) no back-end, incluindo automações em low code com N8N e GPT Maker.',
    en: 'Applications with Angular on the front-end and Node.js (TypeScript) on the back-end, including low-code automations with N8N and GPT Maker.'
  },
  'exp.desc4': {
    pt: 'Desenvolvimento full stack com ReactJS/NextJS e Node.js, com foco em qualidade de código, testes e entregas contínuas. Criação do site institucional e novas telas.',
    en: 'Full stack development with ReactJS/NextJS and Node.js, focused on code quality, testing and continuous delivery. Built the company website and new screens.'
  },
  'exp.desc5': {
    pt: 'Desenvolvimento front-end com Angular, consumo de APIs REST e prototipação no Figma, em metodologia Scrum.',
    en: 'Front-end development with Angular, consuming REST APIs and prototyping in Figma, following Scrum methodology.'
  },
  'exp.b1_1': {
    pt: 'Múltiplos serviços Node.js (API, store, supervisor, conversão de arquivos) com Express, MongoDB e Socket.io',
    en: 'Multiple Node.js services (API, store, supervisor, file conversion) with Express, MongoDB and Socket.io'
  },
  'exp.b1_2': {
    pt: 'Documentação de plugins com schemas de dados e fluxo integrado a GitLab/Jira',
    en: 'Plugin documentation with data schemas and a workflow integrated with GitLab/Jira'
  },
  'exp.b1_3': {
    pt: 'Front-end SPA, renderizador Electron, Keycloak/JWT, MinIO e GraphQL',
    en: 'SPA front-end, Electron renderer, Keycloak/JWT, MinIO and GraphQL'
  },

  'skills.title': { pt: 'Stack &amp; ferramentas', en: 'Stack &amp; tools' },
  'skills.advanced': { pt: 'Avançado', en: 'Advanced' },
  'skills.intermediate': { pt: 'Intermediário', en: 'Intermediate' },
  'skills.basic': { pt: 'Básico', en: 'Basic' },
  'skills.cert1': { pt: 'Bootcamp Banco PAN — Java Dev (DIO, 2023)', en: 'Banco PAN Bootcamp — Java Dev (DIO, 2023)' },
  'skills.cert2': { pt: 'React + Redux do Absoluto Zero (Udemy, 2025)', en: 'React + Redux from Scratch (Udemy, 2025)' },

  'projects.title': { pt: 'Lista de projetos', en: 'Project list' },
  'projects.p1_title': { pt: 'Dashboard CRUD com API REST', en: 'CRUD dashboard with REST API' },
  'projects.p1_desc': {
    pt: 'Cadastro de usuários com autenticação, tarefas e contato — CRUD completo e API segura.',
    en: 'User registration with authentication, tasks and contacts — full CRUD and a secure API.'
  },
  'projects.p2_title': { pt: 'ToDo App com React', en: 'ToDo app with React' },
  'projects.p2_desc': {
    pt: 'Gerenciador de tarefas: adicionar, concluir e excluir afazeres. Stack completa React + Node + MongoDB.',
    en: 'Task manager: add, complete and delete to-dos. Full React + Node + MongoDB stack.'
  },
  'projects.p3_title': { pt: 'Plataforma A2W — consumo de API', en: 'A2W Platform — API consumption' },
  'projects.p3_desc': {
    pt: 'Cadastro de clientes, módulos e módulos por cliente, consumindo API REST pelo back-end.',
    en: 'Client and module registration (and modules per client), consuming a REST API on the back-end.'
  },
  'projects.p4_title': { pt: 'Via CEP com Spring &amp; Swagger', en: 'Via CEP with Spring &amp; Swagger' },
  'projects.p4_desc': {
    pt: 'API REST documentada com Swagger; consulta de CEP retornando dados em JSON, persistidos em H2.',
    en: 'REST API documented with Swagger; postal code lookup returning JSON data, persisted in H2.'
  },
  'projects.p5_title': { pt: 'API REST com Amazon RDS', en: 'REST API with Amazon RDS' },
  'projects.p5_desc': {
    pt: 'API com Spring Data JPA, Spring Web e HATEOAS, conectada ao PostgreSQL via Amazon RDS.',
    en: 'API with Spring Data JPA, Spring Web and HATEOAS, connected to PostgreSQL via Amazon RDS.'
  },
  'projects.p6_title': { pt: 'Clone do sistema acadêmico Lyceum', en: 'Lyceum academic system clone' },
  'projects.p6_desc': {
    pt: 'Recriação do sistema acadêmico da UNIFENAS em Angular — login, dashboard e gestão de disciplinas.',
    en: "Recreation of UNIFENAS's academic system in Angular — login, dashboard and course management."
  },

  'contact.title': { pt: 'Vamos trabalhar juntos?', en: 'Shall we work together?' },
  'contact.echo_cmd': {
    pt: 'echo "Estou disponível para novas oportunidades, freelas e parcerias"',
    en: 'echo "I\'m available for new opportunities, freelance work and partnerships"'
  },
  'contact.echo_out': {
    pt: 'Estou disponível para novas oportunidades, freelas e parcerias',
    en: "I'm available for new opportunities, freelance work and partnerships"
  },
  'contact.email_label': { pt: 'E-mail', en: 'Email' },
  'contact.phone_label': { pt: 'Telefone', en: 'Phone' },
  'contact.location': { pt: 'Alfenas, MG — Brasil', en: 'Alfenas, MG — Brazil' },
  'contact.lets_work': {
    pt: "vamos trabalhar juntos <i class=\"fa-solid fa-arrow-right\"></i>",
    en: "let's work together <i class=\"fa-solid fa-arrow-right\"></i>"
  },

  'footer.made_with': {
    pt: '© 2026 Alexandre Gomes Vieira — feito com <i class="fa-solid fa-heart accent"></i> e muito café',
    en: '© 2026 Alexandre Gomes Vieira — made with <i class="fa-solid fa-heart accent"></i> and lots of coffee'
  },

  'nav.about': { pt: 'Sobre', en: 'About' },
  'nav.experience': { pt: 'Experiência', en: 'Experience' },
  'nav.skills': { pt: 'Habilidades', en: 'Skills' },
  'nav.projects': { pt: 'Projetos', en: 'Projects' },
  'nav.contact': { pt: 'Contato', en: 'Contact' },
};

(function () {
  const switcher = document.getElementById('lang-switcher');
  if (!switcher) return;
  const buttons = switcher.querySelectorAll('.lang-btn');
  const STORAGE_KEY = 'portfolio-lang';
  const saved = localStorage.getItem(STORAGE_KEY) || 'pt';

  function applyLang(lang) {
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'pt-BR');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const entry = I18N[el.getAttribute('data-i18n')];
      if (entry && entry[lang] != null) el.textContent = entry[lang];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const entry = I18N[el.getAttribute('data-i18n-html')];
      if (entry && entry[lang] != null) el.innerHTML = entry[lang];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const entry = I18N[el.getAttribute('data-i18n-title')];
      if (entry && entry[lang] != null) el.setAttribute('title', entry[lang]);
    });
    buttons.forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  }

  applyLang(saved);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      applyLang(lang);
      localStorage.setItem(STORAGE_KEY, lang);
    });
  });
})();

// Local time (Bologna-style footer touch, using Brazil time)
function updateLocalTime() {
  const el = document.getElementById('local-time');
  if (!el) return;
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  el.textContent = `Local time ${time}`;
}
updateLocalTime();
setInterval(updateLocalTime, 30000);

// Dynamic theming — accent color switcher
(function () {
  const root = document.documentElement;
  const switcher = document.getElementById('theme-switcher');
  if (!switcher) return;
  const dots = switcher.querySelectorAll('.theme-dot');
  const STORAGE_KEY = 'portfolio-theme';
  const saved = localStorage.getItem(STORAGE_KEY) || 'green';

  function applyTheme(theme) {
    if (theme === 'green') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    dots.forEach(d => d.classList.toggle('active', d.dataset.theme === theme));
  }

  applyTheme(saved);

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const theme = dot.dataset.theme;
      applyTheme(theme);
      localStorage.setItem(STORAGE_KEY, theme);
    });
  });
})();

// Draggable panels (Sobre section)
(function () {
  const canvas = document.getElementById('desktop-canvas');
  if (!canvas) return;
  const panels = canvas.querySelectorAll('.panel');
  let topZ = 10;

  panels.forEach(panel => {
    const bar = panel.querySelector('.panel-bar');
    let offsetX = 0, offsetY = 0, dragging = false;

    function bringToFront() {
      topZ += 1;
      panel.style.zIndex = topZ;
    }

    function startDrag(clientX, clientY) {
      dragging = true;
      panel.classList.add('dragging');
      bringToFront();
      const rect = panel.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      panel.dataset.canvasLeft = canvasRect.left;
      panel.dataset.canvasTop = canvasRect.top;
    }

    function moveDrag(clientX, clientY) {
      if (!dragging) return;
      const canvasRect = canvas.getBoundingClientRect();
      let newLeft = clientX - canvasRect.left - offsetX;
      let newTop = clientY - canvasRect.top - offsetY;
      newLeft = Math.max(0, Math.min(newLeft, canvas.clientWidth - panel.offsetWidth));
      newTop = Math.max(0, Math.min(newTop, canvas.clientHeight - panel.offsetHeight));
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
    }

    function endDrag() {
      dragging = false;
      panel.classList.remove('dragging');
    }

    // Mouse events
    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    // Touch events
    bar.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchend', endDrag);

    panel.addEventListener('mousedown', bringToFront);
  });
})();

// Rising particles (footer -> header), follow theme accent automatically via CSS vars
(function () {
  const layer = document.getElementById('rising-particles');
  if (!layer) return;
  const COUNT = 22;

  function spawnDrop() {
    const drop = document.createElement('span');
    drop.className = 'drop';
    const size = 4 + Math.random() * 10;
    drop.style.width = size + 'px';
    drop.style.height = size + 'px';
    drop.style.left = Math.random() * 100 + 'vw';
    drop.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
    const duration = 14 + Math.random() * 14;
    drop.style.animationDuration = duration + 's';
    drop.style.animationDelay = (-Math.random() * duration) + 's';
    layer.appendChild(drop);
  }

  for (let i = 0; i < COUNT; i++) spawnDrop();
})();

// Side rail active state on scroll
const railDots = document.querySelectorAll('.rail-dot');
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY + window.innerHeight / 3;
  sections.forEach(section => {
    if (scrollY >= section.offsetTop && scrollY < section.offsetTop + section.offsetHeight) {
      railDots.forEach(d => d.classList.remove('active'));
      const match = document.querySelector(`.rail-dot[data-target="${section.id}"]`);
      if (match) match.classList.add('active');
    }
  });
});

// Scroll reveal animations
const animElements = document.querySelectorAll('[data-anime]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('animated');
        entry.target.querySelectorAll('.fill').forEach(bar => {
          bar.style.width = bar.dataset.w + '%';
        });
      }, i * 70);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

animElements.forEach(el => observer.observe(el));
