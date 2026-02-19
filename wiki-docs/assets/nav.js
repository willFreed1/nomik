(function() {
    // Highlight current page in sidebar
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var links = document.querySelectorAll('.nav-link');
    links.forEach(function(link) {
        var href = link.getAttribute('href');
        if (href === currentPage || (currentPage === 'index.html' && href === 'index.html')) {
            link.classList.add('active');
        }
    });

    // Search
    var searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            links.forEach(function(link) {
                var text = link.textContent.toLowerCase();
                link.style.display = text.includes(q) ? '' : 'none';
            });
            document.querySelectorAll('.nav-group-title').forEach(function(t) {
                t.style.display = q ? 'none' : '';
            });
        });
    }
})();