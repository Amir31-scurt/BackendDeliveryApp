        function filterAndSortItems() {
            const searchInput = document.getElementById('menuSearch');
            const categoryFilter = document.getElementById('categoryFilter');
            const sortFilter = document.getElementById('sortFilter');
            const menuItemsContainer = document.querySelector('.menu-grid');
            const menuItems = Array.from(document.querySelectorAll('.menu-item-card'));

            const searchTerm = searchInput.value.toLowerCase();
            const selectedCategory = categoryFilter.value;
            const sortValue = sortFilter.value;

            // Filter items
            const filteredItems = menuItems.filter(item => {
                const name = item.querySelector('.menu-item-name').textContent.toLowerCase();
                const description = item.querySelector('.menu-item-description').textContent.toLowerCase();
                const category = item.dataset.category;

                const matchesSearch = name.includes(searchTerm) || description.includes(searchTerm);
                const matchesCategory = selectedCategory === '' || category === selectedCategory;

                if (matchesSearch && matchesCategory) {
                    item.style.display = 'block';
                    return true;
                } else {
                    item.style.display = 'none';
                    return false;
                }
            });

            // Sort visible items
            const sortedItems = filteredItems.sort((a, b) => {
                const nameA = a.querySelector('.menu-item-name').textContent.trim();
                const nameB = b.querySelector('.menu-item-name').textContent.trim();
                const priceA = parseFloat(a.querySelector('.menu-item-price').textContent);
                const priceB = parseFloat(b.querySelector('.menu-item-price').textContent);
                const categoryA = a.dataset.category;
                const categoryB = b.dataset.category;

                switch (sortValue) {
                    case 'name':
                        return nameA.localeCompare(nameB);
                    case 'price-asc':
                        return priceA - priceB;
                    case 'price-desc':
                        return priceB - priceA;
                    case 'category':
                        return categoryA.localeCompare(categoryB);
                    default:
                        return 0;
                }
            });

            // Reorder DOM elements
            sortedItems.forEach(item => menuItemsContainer.appendChild(item));

            // Show/hide "no items" message if needed
            // This assumes there's a specific element for "no items found" distinct from the empty state
        }
