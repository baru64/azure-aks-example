const url = "http://exampleaksbackend1906.northeurope.cloudapp.azure.com";
async function checkBackend() {
    let response = fetch(url);
    let testbox = document.getElementById('testbox');
    if (response.ok) {
      let respjson = await response.json();
      testbox.innerHTML = JSON.stringify(respjson);
    } else {
      testbox.innerHTML = "response is not ok";
    }
}
checkBackend();
