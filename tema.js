// Aplica o tema escolhido pela pessoa antes de a página aparecer (sem piscar).
// Sem escolha salva, vale o tema do navegador/sistema (prefers-color-scheme no estilo.css).
try {
  const t = localStorage.getItem('tema');
  if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t;
} catch { /* armazenamento bloqueado: segue o sistema */ }
