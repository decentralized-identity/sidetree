
function delegateEvent(type, selector, fn, options = {}){
  return (options.container || document).addEventListener(type, e => {
    let node = e.target;
    let match = node.matches(selector);
    if (!match) while (node.parentElement) {
      node = node.parentElement.matches(selector) ? match = node : node.parentElement;
    }
    else if (match) fn.call(node, e, node);
  }, options);
}

var markdown = window.markdownit();

/* Sidebar Interactions */

delegateEvent('pointerup', '[panel-toggle]', (e, delegate) => {
  slidepanels.toggle(delegate.getAttribute('panel-toggle'));
}, { passive: true });

window.addEventListener('hashchange', (e) => slidepanels.close());

/* GitHub Issues */

 let source = specConfig.source;
  if (source) {
    if (source.host === 'github') {
      fetch(`https://api.github.com/repos/${ source.account + '/' + source.repo }/issues`)
        .then(response => response.json())
        .then(issues => {
          let count = issues.length;
          document.querySelectorAll('[issue-count]').forEach(node => {
            node.setAttribute('issue-count', count)
          });
          repo_issue_list.innerHTML = issues.map(issue => {
            return `<li class="repo-issue">
              <detail-box>
                <section>${markdown.render(issue.body)}</section>
                <header class="repo-issue-title">
                  <span class="repo-issue-number">${issue.number}</span>
                  <span class="repo-issue-link">
                    <a href="${issue.html_url}" target="_blank">${issue.title}</a>
                  </span>
                  <span detail-box-toggle></span>
                </header>
              </detail-box>
            </li>`
          }).join('');
          Prism.highlightAllUnder(repo_issue_list);
        })
    }
  }
  //${markdown.render(issue.body)}

/* Mermaid Diagrams */

mermaid.initialize({
  startOnLoad: true,
  theme: 'neutral'
});


/* Charts */

document.querySelectorAll('.chartjs').forEach(chart => {
  new Chart(chart, JSON.parse(chart.textContent));
});



