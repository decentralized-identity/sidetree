
customElements.define('slide-panels', class SidePanels extends HTMLElement {
  static get observedAttributes() {
    return ['open'];
  }
  constructor() {
    super();
    
    this.addEventListener('pointerup', e => {
      if (e.target === this) this.close();
    })
  }
  get active (){
    return this.getAttribute('open');
  }
  toggle(panel){
    this.active === panel ? this.close() : this.open(panel)
  }
  open (panel){
    this.setAttribute('open', panel);
  }
  close (){
    this.removeAttribute('open');
  }
  attributeChangedCallback(attr, last, current) {
    switch(attr) {
      case 'open': for (let child of this.children) {
        if (child.id === current) child.setAttribute('open', '');
        else child.removeAttribute('open', '');
      }
      break;
    }
  }
});

customElements.define('detail-box', class DetailBox extends HTMLElement {
  static get observedAttributes() {
    return ['open'];
  }
  constructor() {
    super();   
    
    this.addEventListener('pointerup', e => {
      if (e.target.hasAttribute('detail-box-toggle')) {
        e.stopPropagation();
        this.toggle();   
      }
    });

    this.addEventListener('transitionend', e => {
      let node = e.target;
      if (node.parentElement === this && node.tagName === 'SECTION' && e.propertyName === 'height') {
        node.style.height = this.hasAttribute('open') ? 'auto' : null;
      }
    });
  }
  toggle(){
    this.toggleAttribute('open');
  }
  attributeChangedCallback(attr, last, current) {
    switch(attr) {
      case 'open':
        for (let node of this.children) {
          if (node.tagName === 'SECTION') {
            if (current !== null) {
              if (node.offsetHeight < node.scrollHeight) {
                node.style.height = node.scrollHeight + 'px';
              }
            }
            else if (node.offsetHeight > 0) {
              node.style.height = node.offsetHeight + 'px';
              let scroll = this.scrollHeight;
              node.style.height = 0;
            }
            break;
          }
        }
    }
  }
});

