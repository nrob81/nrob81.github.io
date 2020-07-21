$(document).ready(function () {

	const exp = async function (path) {
		console.log('async function...');
		await CefSharp.BindObjectAsync("explorer");

		//The default is to camel case method names (the first letter of the method name is changed to lowercase)
		explorer.open(path).then(() => console.log('open()'))
	}

	$('a').on('click', async (event) => {
		let linkPath = $(event.target).data('target');
		console.log(linkPath);
		await exp(linkPath);
	});

});