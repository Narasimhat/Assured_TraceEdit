window.addEventListener('DOMContentLoaded',()=>{
 const saved=sessionStorage.getItem('catalog-reads');if(!saved)return;
 const frame=document.querySelector('#peaksplit iframe');if(!frame)return;
 frame.addEventListener('load',()=>{frame.contentWindow.postMessage({type:'load-catalog-reads',reads:JSON.parse(saved)},location.origin);sessionStorage.removeItem('catalog-reads');},{once:true});
 frame.loading='eager';frame.src='/peaksplit/';
});
