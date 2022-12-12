const target = document.querySelectorAll('[data-anime]')
const animationClass = 'animate'

function animeScroll(){
    const windowTop = window.pageYOffset + ((window.innerHeight * 3)/4)
    target.forEach(function(el){
        if((windowTop) > el.offsetTop){
            el.classList.add(animationClass)
        }
    })
}
window.addEventListener('scroll',function(){
    animeScroll();
})