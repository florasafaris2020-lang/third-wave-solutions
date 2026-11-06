(function () {
  'use strict';
  var toggle=document.getElementById('menuToggle');
  var nav=document.getElementById('nav');
  if(toggle&&nav){toggle.addEventListener('click',function(){var open=nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));});nav.addEventListener('click',function(e){if(e.target.tagName==='A'){nav.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');}});}
  var year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();

  var sellerForm=document.getElementById('sellerForm');
  if(sellerForm){
    sellerForm.action='/api/business-submit';sellerForm.method='POST';sellerForm.enctype='multipart/form-data';
    sellerForm.addEventListener('submit',async function(event){
      event.preventDefault();
      if(!sellerForm.reportValidity())return;
      var button=sellerForm.querySelector('button[type="submit"]');
      var status=sellerForm.querySelector('#formStatus');
      if(button){button.disabled=true;button.textContent='Submitting…';}
      if(status){status.textContent='Sending your proposal securely…';status.style.color='#0a5f59';}
      try{
        var response=await fetch('/api/business-submit',{method:'POST',body:new FormData(sellerForm),headers:{Accept:'application/json'}});
        var result=await response.json();if(!response.ok)throw new Error(result.error||'Submission failed.');
        sellerForm.reset();if(status){status.textContent=result.message;status.style.color='#0a5f59';}
      }catch(error){if(status){status.textContent=error.message||'Could not submit. Please try again or call us.';status.style.color='#a33';}}
      finally{if(button){button.disabled=false;button.textContent='Send business details';}}
    });
  }

  var grid=document.querySelector('#listings .grid.grid--3')||document.querySelector('main .section .grid.grid--3');
  if(grid){fetch('/data/businesses.json',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('Listings not available');return r.json();}).then(function(items){
    var approved=Array.isArray(items)?items.filter(function(item){return item&&item.status==='approved';}):[];
    if(!approved.length)return;
    grid.querySelectorAll('.listing').forEach(function(card){card.hidden=true;});
    approved.forEach(function(item){
      var article=document.createElement('article');article.className='card listing';
      var media=document.createElement('div');media.className='listing-media';var img=document.createElement('img');img.src=item.image||'assets/img/retail.jpg';img.alt=item.businessName||'Business listing';img.loading='lazy';var badge=document.createElement('span');badge.className='badge';badge.textContent='Approved listing';media.append(img,badge);
      var body=document.createElement('div');body.className='listing-body';var top=document.createElement('div');top.className='listing-top';var heading=document.createElement('h3');heading.textContent=item.businessName||'Business';var price=document.createElement('span');price.className='ask';price.textContent=item.askingPrice||'Discussed';top.append(heading,price);
      var location=document.createElement('p');location.className='loc';location.textContent=item.location||'Kenya';var desc=document.createElement('p');desc.className='desc';desc.textContent=item.description||'';body.append(top,location,desc);article.append(media,body);grid.prepend(article);
    });
  }).catch(function(error){console.warn(error);});}
})();
