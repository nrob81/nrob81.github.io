const exp = async function (path) {
	await CefSharp.BindObjectAsync("explorer")
	explorer.open(path).then(() => console.log('open()'))
}

function callback(e) {
    var e = window.e || e;

    if (e.target.tagName !== 'A')
        return;

    exp(e.target.getAttribute('data-target'))
}

if (document.addEventListener) {
    document.addEventListener('click', callback, false)
} else {
    document.attachEvent('onclick', callback)
}