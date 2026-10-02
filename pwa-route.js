(() => {
  const url = new URL(location.href);
  if (url.searchParams.get('installed') !== '1' || url.searchParams.has('sales')) return;
  try { const sales = localStorage.getItem('th6:installed-sales'); if (sales) { url.searchParams.set('sales', sales); history.replaceState(null, '', url); } } catch {}
})();
