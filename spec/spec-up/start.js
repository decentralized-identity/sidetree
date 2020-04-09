
const gulp = require('gulp');
const fs = require('fs-extra');
const pkg = require('pkg-dir');
const globby = require('globby');

function getRelativePrefix(location){
  return (location.match(/\/[a-zA-Z0-9-\._]+/g) || []).map(() => '../').join('') || './';
}

function normalizePath(path){
  return path.trim().replace(/\/$/g, '') + '/';
}

let init = async () => {
  try {
    let projectPath = await pkg(__dirname);
    let json = await fs.readJson(projectPath + '/specs.json');
    json.specs.forEach(config => {
      config.spec_directory = normalizePath(config.spec_directory);
      config.destination = normalizePath(config.output_path || config.spec_directory);
      config.destinationResourcePrefix = getRelativePrefix(config.destination);
      config.rootResourcePrefix = './';
      if (json.resource_path) {
        let path = config.rootResourcePrefix = normalizePath(json.resource_path);
        config.destinationResourcePrefix += path.replace(/^\/|^[./]+/, '');
      }
      if (!process.argv.includes('nowatch')) {
        gulp.watch(
          [config.spec_directory + '**/*', '!' + config.destination + 'index.html'],
          render.bind(null, config)
        )
      }
      render.call(null, config);
    });
  }
  catch (e) {
    console.log(e);
  }
};

init();

/* RENDERING */

var toc;
var noticeTypes = {
  note: 1,
  issue: 1,
  example: 1,
  warning: 1,
  todo: 1
};
var noticeTitles = {};
var noticeParser = {
  validate: function(params) {
    let matches = params.match(/(\w+)\s?(.*)?/);
    if (matches && noticeTypes[matches[1]]) return matches[1];
  },
  render: function (tokens, idx) {
    let matches = tokens[idx].info.match(/(\w+)\s?(.*)?/);
    if (matches && tokens[idx].nesting === 1) {
      let id;
      let type = matches[1];
      if (matches[2]) {
        id = matches[2].trim().replace(/\s+/g , '-').toLowerCase();
        if (noticeTitles[id]) id += '-' + noticeTitles[id]++;
        else noticeTitles[id] = 1;
      }
      else id = type + '-' + noticeTypes[type]++;
      return `<div id="${id}" class="notice ${type}"><a class="notice-link" href="#${id}">${type.toUpperCase()}</a>`;
    }
    else return '</div>\n';
  }
};

const containers = require('markdown-it-container');
const md = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true
})
  .use(require('markdown-it-abbr'))
  .use(require('markdown-it-attrs'))
  .use(require('markdown-it-chart').default)
  .use(containers, 'notice', noticeParser)
  .use(require('markdown-it-deflist'))
  .use(require('markdown-it-footnote'))
  .use(require('markdown-it-icons').default, 'font-awesome')
  .use(require('markdown-it-ins'))
  .use(require('markdown-it-latex').default)
  .use(require('markdown-it-mark'))
  .use(require('markdown-it-textual-uml'))
  .use(require('markdown-it-multimd-table'), {
    multiline:  true,
    rowspan:    true,
    headerless: true
  })
  .use(require('markdown-it-prism'), { plugins: ['copy-to-clipboard'] })
  .use(require('markdown-it-sub'))
  .use(require('markdown-it-sup'))
  .use(require('markdown-it-task-lists'))
  .use(require('markdown-it-toc-and-anchor').default, {
    tocClassName: 'toc',
    tocFirstLevel: 2,
    tocLastLevel: 4,
    tocCallback: (md, tokens, html) => toc = html,
    anchorLinkSymbol: '§',
    anchorClassName: 'toc-anchor'
  })

function readMDFile(path, reject) {
  return fs.readFile(path, 'utf8').catch(e => reject(e));
}

async function render(config) {
  console.log('Rendering: ' + config.title);
  return new Promise(async (resolve, reject) => {
    Promise.all((config.markdown_paths || ['spec.md']).map(path => {
      return readMDFile(config.spec_directory + path, reject)
    })).then(async docs => {
      let doc = docs.join("\n");
      var features = (({ source, logo }) => ({ source, logo }))(config);
      var assetPrefix = config.destinationResourcePrefix;
      var svg = await fs.readFile(config.rootResourcePrefix + 'spec-up/icons.svg', 'utf8') || '';
      fs.writeFile(config.destination + 'index.html', `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">

            <title>${config.title}</title>
            <link href="${assetPrefix}spec-up/css/custom-elements.css" rel="stylesheet">
            <link href="${assetPrefix}spec-up/css/prism.css" rel="stylesheet">
            <link href="${assetPrefix}spec-up/css/chart.css" rel="stylesheet">
            <link href="${assetPrefix}spec-up/css/font-awesome.css" rel="stylesheet">
            <link href="${assetPrefix}spec-up/css/index.css" rel="stylesheet">
            <script src="${assetPrefix}spec-up/js/custom-elements.js"></script>
          </head>
          <body features="${Object.keys(features).join(' ')}">
            
            ${svg}

            <main>

              <header id="header" class="panel-header">
                <span id="toc_toggle" panel-toggle="toc">
                  <svg icon><use xlink:href="#nested_list"></use></svg>
                </span>
                <a id="logo" href="${config.logo_link ? config.logo_link : '#_'}">
                  <img src="${config.logo}" />
                </a>
                <span issue-count animate panel-toggle="repo_issues">
                  <svg icon><use xlink:href="#github"></use></svg>
                </span>
              </header>

              <article id="content">
                ${md.render(doc)}
              </article>    

            </main>

            <slide-panels id="slidepanels">
              <slide-panel id="repo_issues" options="right">
                <header class="panel-header">
                  <span>
                    <svg icon><use xlink:href="#github"></use></svg>
                    <span issue-count></span>
                  </span>
                  <span class="repo-issue-toggle" panel-toggle="repo_issues">✕</span>
                </header>
                <ul id="repo_issue_list"></ul>
              </slide-panel>

              <slide-panel id="toc">
                <header class="panel-header">
                  <span>Table of Contents</span>
                  <span panel-toggle="toc">✕</span>
                </header>
                <div id="toc_list">
                  ${toc}
                </div>
              </slide-panel>
              
            </slide-panels>

          </body>
          <script>window.specConfig = ${JSON.stringify(config)}</script>
          <script src="${assetPrefix}spec-up/js/markdown-it.js"></script>
          <script src="${assetPrefix}spec-up/js/prism.js" data-manual></script>
          <script src="${assetPrefix}spec-up/js/mermaid.js"></script>
          <script src="${assetPrefix}spec-up/js/chart.js"></script>
          <script src="${assetPrefix}spec-up/js/index.js"></script>
        </html>
      `, function(err, data){
        if (err) reject(err);
        else resolve();
      }); 
    });
  });
}