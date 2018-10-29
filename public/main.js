document.addEventListener("DOMContentLoaded", function() {
  var spinner = document.querySelector(".spinner");

  if (!!window.EventSource) {
    var source = new EventSource("http://localhost:5000/status");

    source.addEventListener(
      "message",
      function(e) {
        console.log(e);
        if (e.data === "start") {
          spinner.style.display = "flex";
        }
        if (e.data === "end") {
          spinner.style.display = "none";
        }
      },
      false
    );

    source.addEventListener(
      "open",
      function(e) {
        console.log("Connection was opened");
      },
      false
    );

    source.addEventListener(
      "error",
      function(e) {
        if (e.readyState == EventSource.CLOSED) {
          console.log("Connection was closed");
        }
      },
      false
    );
  }
});
