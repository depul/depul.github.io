// script.js

// Global state
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let currentCard = null;
let listings = JSON.parse(localStorage.getItem('listings')) || [];
let users = JSON.parse(localStorage.getItem('users')) || [];
let debounceTimer;
let lastFetchedCards = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupAutocomplete();
    displayListings();

    // Show welcome message instead of cards
    showWelcomeMessage();

    // Modal close button
    document.querySelector('.close').addEventListener('click', () => {
        document.getElementById('cardModal').style.display = 'none';
    });

    // Listing form submission
    document.getElementById('listingForm').addEventListener('submit', createListing);

     // Modal close on outside click
    document.getElementById('cardModal').addEventListener('click', function(event) {
        if (event.target === this) {
            this.style.display = 'none';
        }
    });
});

function showWelcomeMessage() {
     document.getElementById('cardGrid').innerHTML = `
        <div class="welcome-message">
            <h2>Welcome to Yu-Gi-Oh! Card Marketplace</h2>
            <p>Search for cards above to begin</p>
        </div>
    `;
}

// Authentication Functions
function checkAuth() {
    const userAuthSection = document.getElementById('userAuthSection');
    const userProfileSection = document.getElementById('userProfileSection');
    
    if (currentUser) {
        userAuthSection.classList.add('hidden');
        userProfileSection.classList.remove('hidden');
        updateProfileDisplay();
    } else {
        userAuthSection.classList.remove('hidden');
        userProfileSection.classList.add('hidden');
    }
}

function toggleAuthForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    loginForm.classList.toggle('hidden');
    registerForm.classList.toggle('hidden');
}

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

     if (!email || !password) {
      alert('Please enter both email and password.');
      return;
    }

    const user = users.find(u => u.email === email && u.password === hashPassword(password));
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        checkAuth();
    } else {
        alert('Invalid credentials');
    }
}


async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

     if (!username || !email || !password) {
        alert('Please fill in all registration fields.');
         return;
    }

    if (users.some(u => u.email === email)) {
        alert('Email already registered');
        return;
    }

    const hashedPassword = hashPassword(password);

    const newUser = {
        id: Date.now(),
        username,
        email,
        password: hashedPassword,
        profileImage: 'default-profile.png',
        rating: 0,
        trades: 0,
        favorites: [],
        collection: [],
        tradingHistory: []
    };

    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    currentUser = newUser;
    localStorage.setItem('currentUser', JSON.stringify(newUser));
    checkAuth();
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    checkAuth();
}

// Profile Management Functions
function handleProfileImageChange(event) {
    const file = event.target.files[0];
    if (file && currentUser) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            currentUser.profileImage = e.target.result;
             await updateUser(currentUser);
            updateProfileDisplay();
        };
        reader.readAsDataURL(file);
    }
}

async function updateUser(user) {
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
         users[index] = user;
        localStorage.setItem('users', JSON.stringify(users));
        currentUser = users.find(u => u.id === user.id)
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

    }
}


function updateProfileDisplay() {
    if (!currentUser) return;
    document.getElementById('profileImage').src = currentUser.profileImage;
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('sellerRating').textContent = `Rating: ${currentUser.rating}`;
    document.getElementById('totalTrades').textContent = `Trades: ${currentUser.trades}`;
    displayFavorites();
    displayCollection();
    displayTradingHistory();
}

// Tab Management
function switchTab(tabName) {
    const tabs = ['favorites', 'collection', 'history'];
    tabs.forEach(tab => {
        document.getElementById(`${tab}Tab`).classList.add('hidden');
        document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.remove('hidden');
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
}

// Card Management Functions
async function toggleFavorite(cardId, cardData) {
   if (!currentUser) {
        alert('Please login to add favorites');
        return;
    }

    const card = JSON.parse(decodeURIComponent(cardData));

    const index = currentUser.favorites.findIndex(fav => fav.id === cardId);
    if (index === -1) {
      currentUser.favorites.push(card);
    } else {
      currentUser.favorites.splice(index, 1);
    }

     await updateUser(currentUser);
    updateProfileDisplay();

}


async function addToCollection(card) {
    if (!currentUser) {
        alert('Please login to add to collection');
        return;
    }

    if (!currentUser.collection.some(c => c.id === card.id)) {
        currentUser.collection.push(card);
        await updateUser(currentUser);
        updateProfileDisplay();
        alert('Card added to collection!');
    } else {
        alert('Card already in collection!');
    }
}

// Password hashing function (basic for demonstration)
function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return String(hash);
}

// Search and Display Functions
function setupAutocomplete() {
    const searchInput = document.getElementById('searchInput');
    const autocompleteList = document.getElementById('autocompleteList');

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const searchTerm = e.target.value;
            if (searchTerm.length >= 2) {
                fetchAutocompleteSuggestions(searchTerm);
            } else {
                autocompleteList.innerHTML = '';
            }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (e.target !== searchInput) {
            autocompleteList.innerHTML = '';
        }
    });
}

async function fetchAutocompleteSuggestions(searchTerm) {
    const autocompleteList = document.getElementById('autocompleteList');
    try {
        const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${searchTerm}`);
        const data = await response.json();

        if (!data || !data.data) {
            autocompleteList.innerHTML = '<div>No suggestions found</div>';
            return;
        }

        autocompleteList.innerHTML = '';

        const uniqueCards = [...new Set(data.data.map(card => card.name))]
            .sort()
            .slice(0, 10);

        uniqueCards.forEach(cardName => {
            const div = document.createElement('div');
            div.textContent = cardName;
            div.addEventListener('click', () => {
                document.getElementById('searchInput').value = cardName;
                autocompleteList.innerHTML = '';
                searchCards();
            });
            autocompleteList.appendChild(div);
        });
    } catch (error) {
        console.error('Error fetching suggestions:', error);
        autocompleteList.innerHTML = '<div>Error loading suggestions</div>';
    }
}

async function searchCards() {
  const searchTerm = document.getElementById('searchInput').value;
  const cardGrid = document.getElementById('cardGrid');
  const cardType = document.getElementById('cardType').value;
  const loading = document.getElementById('loading');

  cardGrid.innerHTML = '';
  loading.classList.remove('hidden');

  try {
    let url = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?';
    if (searchTerm) url += `fname=${encodeURIComponent(searchTerm)}`;
    if (cardType) url += `${searchTerm ? '&' : ''}type=${cardType}`;

      const response = await fetch(url);
      const data = await response.json();

    if (!data || !data.data || data.data.length === 0) {
      cardGrid.innerHTML = '<p class="welcome-message">No cards found. Try a different search term.</p>';
      return;
    }

      lastFetchedCards = data.data;
     displayData('card', lastFetchedCards, cardGrid);

  } catch (error) {
    console.error('Error fetching cards:', error);
    cardGrid.innerHTML = '<p class="welcome-message">Error loading cards. Please try again.</p>';
  } finally {
    loading.classList.add('hidden');
  }
}

function displayData(type, data, container) {
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = `<p class="welcome-message">No ${type} found.</p>`;
        return;
    }

    if (type === 'card') {
        data.forEach(item => {
            const isFavorite = currentUser?.favorites.some(f => f.id === item.id);
            const encodedCardData = encodeURIComponent(JSON.stringify(item));

            const cardElement = document.createElement('div');
            cardElement.className = 'card';

            // Display multiple images
            let imageHTML = '';
            if (item.card_images.length > 1) {
                 imageHTML = `<div class="image-carousel">
                      ${item.card_images.map((img, index) => `
                        <img src="${img.image_url_small}" alt="${item.name} Art ${index+1}" onclick="event.stopPropagation(); showCardModal(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({...item, selectedImageIndex: index}) ) }")))">
                    `).join('')}
                </div>`;
                cardElement.innerHTML = `
                    ${imageHTML}
                    <h3>${item.name}</h3>
                    ${currentUser ? `
                        <button class="favorite-btn ${isFavorite ? 'active' : ''}"
                                onclick="event.stopPropagation(); toggleFavorite(${item.id}, "${encodedCardData}")">
                            ♥
                        </button>
                    ` : ''}
                `;
                 cardElement.addEventListener('click', () => showCardModal(item));
                
            } else {
                    cardElement.innerHTML = `
                        <img src="${item.card_images[0].image_url}" alt="${item.name}">
                        <h3>${item.name}</h3>
                        ${currentUser ? `
                            <button class="favorite-btn ${isFavorite ? 'active' : ''}"
                                    onclick="event.stopPropagation(); toggleFavorite(${item.id}, "${encodedCardData}")">
                                ♥
                            </button>
                        ` : ''}
                    `;
                     cardElement.addEventListener('click', () => showCardModal(item));
            }


           container.appendChild(cardElement);
        });
    } else if (type === 'listing') {
      data.forEach(listing => {
        const listingElement = document.createElement('div');
        listingElement.className = 'listing-card';
            const selectedImage = listing.cardImage
        listingElement.innerHTML = `
                <div class="listing-header">
                    <h3>${listing.cardName}</h3>
                    ${currentUser && listing.sellerId === currentUser.id ?
                        `<button class="remove-btn" onclick="removeListing(${listing.id})">×</button>` : ''}
                </div>
                <img src="${selectedImage}" alt="${listing.cardName}">
                <p class="price">$${listing.price}</p>
                <p><strong>Condition:</strong> ${listing.condition}</p>
                ${listing.rarity ? `<p><strong>Rarity:</strong> ${listing.rarity}</p>` : ''}
                ${listing.attribute ? `<p><strong>Attribute:</strong> ${listing.attribute}</p>` : ''}
                ${listing.level !== null ? `<p><strong>Level/Rank:</strong> ${listing.level}</p>` : ''}
                <p><strong>Seller:</strong> ${listing.sellerName}</p>
                <p><strong>Seller Rating:</strong> ${listing.sellerRating} ⭐</p>
                <p><strong>Listed:</strong> ${new Date(listing.date).toLocaleString()}</p>
            `;
        container.appendChild(listingElement);
    });
    }
}


function showCardModal(card) {
    currentCard = card;
    const modal = document.getElementById('cardModal');
    const modalContent = document.getElementById('modalContent');
    const selectedImageIndex = card.selectedImageIndex !== undefined ? card.selectedImageIndex : 0;


    modalContent.innerHTML = `
        <img src="${card.card_images[selectedImageIndex].image_url}" alt="${card.name}">
        ${card.card_images.length > 1 ? `
        <div class="image-carousel">
              ${card.card_images.map((img, index) => `
                <img src="${img.image_url_small}" alt="${card.name} Art ${index+1}" onclick="showCardModal(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({...card, selectedImageIndex: index}) ) }")))">
            `).join('')}
        </div>` : ''}
        <div class="card-details">
            <h2>${card.name}</h2>
            <div class="card-info">
                <p><strong>Type:</strong> ${card.type}</p>
                <p><strong>Race:</strong> ${card.race}</p>
                ${card.atk !== undefined ? `<p><strong>ATK/DEF:</strong> ${card.atk}/${card.def}</p>` : ''}
                 ${card.card_sets && card.card_sets.length > 0 ? `
                    <div class="card-sets">
                        <p><strong>Card Sets:</strong></p>
                        <ul>
                            ${card.card_sets.map(set => `
                                <li onclick="showCardModal(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({...card, selectedImageIndex: card.card_images.findIndex(img => img.id === card.card_images.find(img => img.image_url.includes(set.set_code))?.id) || 0 }) ) }")))" >
                                    ${set.set_name} (${set.set_code}) - ${set.set_rarity}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                  ` : ''}
                ${currentUser ? `
                    <button onclick="addToCollection(currentCard)" class="collection-btn">
                        Add to Collection
                    </button>
                ` : ''}
            </div>
            <div class="card-description">
                <p><strong>Description:</strong></p>
                <p>${card.desc}</p>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}


// Listing Management Functions
async function createListing(e) {
    e.preventDefault();

     if (!currentUser) {
        alert('Please login to create a listing');
        return;
    }

    if (!currentCard) {
        alert('No card selected for listing');
        return;
    }

     const priceInput = document.getElementById('price');
      const conditionInput = document.getElementById('condition');

      if (!priceInput.value || isNaN(parseFloat(priceInput.value)) || parseFloat(priceInput.value) <= 0) {
        alert('Please enter a valid price.');
        return;
    }

      if (!conditionInput.value) {
        alert('Please select a card condition.');
        return;
    }

    // Extract extra data from currentCard
    // Use first set rarity if available, else empty string
        const selectedImageIndex = currentCard.selectedImageIndex !== undefined ? currentCard.selectedImageIndex : 0;
        const cardImage = currentCard.card_images[selectedImageIndex].image_url;
        const rarity = currentCard.card_sets && currentCard.card_sets.length > 0 ? currentCard.card_sets[0].set_rarity : '';
        const attribute = currentCard.attribute || '';
        const level = currentCard.level !== undefined ? currentCard.level : null;


    const listing = {
        id: Date.now(),
        cardId: currentCard.id,
        cardName: currentCard.name,
          cardImage: cardImage,
        price: parseFloat(document.getElementById('price').value),
        condition: document.getElementById('condition').value,
        sellerId: currentUser.id,
        sellerName: currentUser.username,
        sellerRating: currentUser.rating,
        date: new Date().toISOString(),
        rarity: rarity,
        attribute: attribute,
        level: level
    };

    listings.push(listing);
    localStorage.setItem('listings', JSON.stringify(listings));


    // Add to trading history
    currentUser.trades++;
     currentUser.tradingHistory.push({
        type: 'Listed',
        cardName: listing.cardName,
        price: listing.price,
        date: listing.date
    });
    await updateUser(currentUser);


    document.getElementById('cardModal').style.display = 'none';
    document.getElementById('listingForm').reset();
    displayListings();
}


function removeListing(listingId) {
    if (confirm('Are you sure you want to remove this listing?')) {
        listings = listings.filter(listing => listing.id !== listingId);
        localStorage.setItem('listings', JSON.stringify(listings));
        displayListings();
    }
}


function displayListings() {
    const listingsContainer = document.getElementById('listings');
    listingsContainer.innerHTML = '';

    // Get filter values
    const minPrice = parseFloat(document.getElementById('minPrice').value) || 0;
    const maxPrice = parseFloat(document.getElementById('maxPrice').value) || Number.MAX_VALUE;
    const rarityFilter = document.getElementById('rarityFilter').value;
    const attributeFilter = document.getElementById('attributeFilter').value;
    const levelFilter = parseInt(document.getElementById('levelFilter').value) || null;
    const sortOption = document.getElementById('sortOption').value;

    // Filter listings
    let filteredListings = listings.filter(listing => {
        if (listing.price < minPrice || listing.price > maxPrice) return false;
        if (rarityFilter && listing.rarity !== rarityFilter) return false;
        if (attributeFilter && listing.attribute !== attributeFilter) return false;
        if (levelFilter !== null && listing.level !== levelFilter) return false;
        return true;
    });

    // Sorting
    switch (sortOption) {
        case 'priceAsc':
            filteredListings.sort((a, b) => a.price - b.price);
            break;
        case 'priceDesc':
            filteredListings.sort((a, b) => b.price - a.price);
            break;
        case 'dateListed':
            filteredListings.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
        case 'rarity':
            // Sort by rarity alphabetically
            filteredListings.sort((a, b) => {
                if (a.rarity < b.rarity) return -1;
                if (a.rarity > b.rarity) return 1;
                return 0;
            });
            break;
        default:
            // No sorting
            break;
    }

     displayData('listing', filteredListings, listingsContainer)
}

// Display functions for profile tabs
function displayFavorites() {
    if (!currentUser) return;
    const container = document.getElementById('favoriteCards');
    container.innerHTML = '';

    if (currentUser.favorites.length === 0) {
         container.innerHTML = '<p class="welcome-message">No favorites yet.</p>';
        return;
    }


    currentUser.favorites.forEach(card => {
      const cardElement = document.createElement('div');
      cardElement.className = 'card';
      const encodedCardData = encodeURIComponent(JSON.stringify(card));
           // Display multiple images
            let imageHTML = '';
            if (card.card_images.length > 1) {
                 imageHTML = `<div class="image-carousel">
                      ${card.card_images.map((img, index) => `
                        <img src="${img.image_url_small}" alt="${card.name} Art ${index+1}" onclick="event.stopPropagation(); showCardModal(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({...card, selectedImageIndex: index}) ) }")))">
                    `).join('')}
                </div>`;
                 cardElement.innerHTML = `
                    ${imageHTML}
                    <h3>${card.name}</h3>
                    <button class="favorite-btn active" onclick="toggleFavorite(${card.id}, "${encodedCardData}")">♥</button>
                `;
                
            } else {
                   cardElement.innerHTML = `
                        <img src="${card.card_images[0].image_url}" alt="${card.name}">
                        <h3>${card.name}</h3>
                         <button class="favorite-btn active" onclick="toggleFavorite(${card.id}, "${encodedCardData}")">♥</button>
                `;
            }
      container.appendChild(cardElement);
    });
}

function displayCollection() {
    if (!currentUser) return;
    const container = document.getElementById('collectionCards');
    container.innerHTML = '';

      if (currentUser.collection.length === 0) {
         container.innerHTML = '<p class="welcome-message">No cards in collection yet.</p>';
        return;
    }


    currentUser.collection.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
              // Display multiple images
              let imageHTML = '';
            if (card.card_images.length > 1) {
                 imageHTML = `<div class="image-carousel">
                      ${card.card_images.map((img, index) => `
                        <img src="${img.image_url_small}" alt="${card.name} Art ${index+1}" onclick="event.stopPropagation(); showCardModal(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify({...card, selectedImageIndex: index}) ) }")))">
                    `).join('')}
                </div>`;
                 cardElement.innerHTML = `
                    ${imageHTML}
                    <h3>${card.name}</h3>
                `;
                
            } else {
                 cardElement.innerHTML = `
                        <img src="${card.card_images[0].image_url}" alt="${card.name}">
                        <h3>${card.name}</h3>
                `;
            }
         container.appendChild(cardElement);
    });
}


function displayTradingHistory() {
    if (!currentUser) return;
    const container = document.getElementById('tradingHistory');
    container.innerHTML = '';

     if (currentUser.tradingHistory.length === 0) {
         container.innerHTML = '<p class="welcome-message">No trading history yet.</p>';
        return;
    }

    currentUser.tradingHistory.forEach(trade => {
        const tradeElement = document.createElement('div');
        tradeElement.className = 'trade-item';
        tradeElement.innerHTML = `
            <span>${new Date(trade.date).toLocaleString()}</span>
            <span>${trade.type}</span>
            <span>${trade.cardName}</span>
            <span>$${trade.price}</span>
        `;
        container.appendChild(tradeElement);
    });
}