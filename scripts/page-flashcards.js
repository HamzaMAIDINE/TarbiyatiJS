let activeCards = [...FLASHCARDS_DATA];
    let currentIndex = 0;
    let isFlipped = false;
    let currentCat = 'all';
    let dueOnly = false;
    let todayCardIds = [];

    function setDueCards() {
      dueOnly = document.getElementById('dueOnly').checked;
      todayCardIds = ProgressManager.getReview().dueIds;
      filterFCCat(currentCat, document.querySelector('.fc-pill.btn-primary'));
    }

    function filterFCCat(cat, btn) {
      currentCat = cat;
      document.querySelectorAll('.fc-pill').forEach(b => b.className = 'btn btn-sm btn-outline fc-pill');
      btn.className = 'btn btn-sm btn-primary fc-pill';

      activeCards = FLASHCARDS_DATA.filter(c => {
        return (cat === 'all' || c.category === cat) && (!dueOnly || todayCardIds.includes(c.id));
      });

      document.getElementById('flashcardEmpty').hidden = activeCards.length !== 0;
      document.querySelector('.flashcard-wrapper').hidden = !activeCards.length;
      document.getElementById('flashcardNavigation').hidden = !activeCards.length;
      document.querySelectorAll('[data-card-mark]').forEach(button => button.disabled = !activeCards.length);
      currentIndex = 0;
      loadCard(0);
    }

    function loadCard(idx) {
      if (idx < 0 || idx >= activeCards.length) return;
      currentIndex = idx;
      isFlipped = false;
      document.getElementById('cardInner').classList.remove('flipped');
      document.querySelector('.flashcard-wrapper').setAttribute('aria-pressed', 'false');

      const card = activeCards[idx];
      document.getElementById('fcCatBadge').textContent = card.category;
      document.getElementById('fcFrontText').textContent = card.front;
      document.getElementById('fcBackText').textContent = card.back.replace(/\\n/g, '\n');
      syncFlashcardFaces();
      document.getElementById('fcProgressCounter').textContent = `البطاقة ${idx + 1} من ${activeCards.length}`;
      updateFlashcardProgress();
    }

    function updateFlashcardProgress() {
      const data = ProgressManager.getData();
      const id = activeCards[currentIndex]?.id;
      document.getElementById('fcMasterySummary').textContent = `أتقنت ${data.masteredFlashcards.length} من ${FLASHCARDS_DATA.length}`;
      document.getElementById('dueCount').textContent = `${ProgressManager.getReview().dueIds.length} بطاقات مستحقة للمراجعة`;
      const status = document.getElementById('fcSavedStatus');
      const known = data.masteredFlashcards.includes(id);
      const review = data.reviewFlashcards.includes(id);
      status.textContent = known ? '✓ متقنة' : review ? 'للمراجعة' : '';
      status.hidden = !known && !review;
      document.querySelector('[data-card-mark="known"]').setAttribute('aria-pressed', String(known));
      document.querySelector('[data-card-mark="review"]').setAttribute('aria-pressed', String(review));
    }
    window.addEventListener('learning-progress', updateFlashcardProgress);

    function flipCurrentCard() {
      isFlipped = !isFlipped;
      document.getElementById('cardInner').classList.toggle('flipped', isFlipped);
      document.querySelector('.flashcard-wrapper').setAttribute('aria-pressed', String(isFlipped));
      syncFlashcardFaces();
    }

    function syncFlashcardFaces() {
      document.querySelector('.flashcard-front').setAttribute('aria-hidden', String(isFlipped));
      document.querySelector('.flashcard-back').setAttribute('aria-hidden', String(!isFlipped));
      const content = document.getElementById(isFlipped ? 'fcBackText' : 'fcFrontText').textContent;
      document.querySelector('.flashcard-wrapper').setAttribute('aria-label', `${content}. ${isFlipped ? 'اضغط لعرض السؤال' : 'اضغط لعرض الإجابة'}`);
    }

    function nextCard() {
      if (currentIndex < activeCards.length - 1) {
        loadCard(currentIndex + 1);
      } else {
        showToast('🎉 وصلت إلى نهاية هذه المجموعة من البطاقات!');
        loadCard(0);
      }
    }

    function prevCard() {
      if (currentIndex > 0) {
        loadCard(currentIndex - 1);
      }
    }

    let savingCard = false;
    async function markCard(known) {
      if (savingCard) return;
      savingCard = true;
      document.querySelectorAll('[data-card-mark]').forEach(button => button.disabled = true);
      const card = activeCards[currentIndex];
      try {
        if (await ProgressManager.recordFlashcard(card.id, known)) {
          showToast(known ? 'تم حفظ البطاقة ضمن المتقنة في حسابك.' : 'تم حفظ البطاقة للمراجعة.');
          if (activeCards[currentIndex]?.id === card.id) {
            if (dueOnly) {
              todayCardIds = todayCardIds.filter(id => id !== card.id);
              activeCards = activeCards.filter(item => item.id !== card.id);
              document.getElementById('flashcardEmpty').hidden = activeCards.length !== 0;
              document.querySelector('.flashcard-wrapper').hidden = !activeCards.length;
              document.getElementById('flashcardNavigation').hidden = !activeCards.length;
              if (activeCards.length) loadCard(Math.min(currentIndex,activeCards.length - 1));
              else document.getElementById('fcProgressCounter').textContent = 'أكملت مراجعة هذه المجموعة اليوم';
            } else nextCard();
          }
        }
      } finally {
        savingCard = false;
        document.querySelectorAll('[data-card-mark]').forEach(button => button.disabled = !activeCards.length);
      }
    }

    function shuffleCards() {
      for (let index = activeCards.length - 1; index > 0; index--) {
        const selected = Math.floor(Math.random() * (index + 1));
        [activeCards[index], activeCards[selected]] = [activeCards[selected], activeCards[index]];
      }
      currentIndex = 0;
      loadCard(0);
      showToast('🔀 تم خلط البطاقات عشوائياً!');
    }

    function resetFlashcards() {
      currentIndex = 0;
      loadCard(0);
      showToast('🔄 تمت إعادة بدء البطاقات من البداية.');
    }

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('search-open') || document.body.classList.contains('menu-open') || e.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        flipCurrentCard();
      } else if (e.code === 'Enter' && e.target.closest('.flashcard-wrapper')) {
        e.preventDefault();
        flipCurrentCard();
      } else if (e.code === 'ArrowLeft') {
        nextCard();
      } else if (e.code === 'ArrowRight') {
        prevCard();
      }
    });

    document.addEventListener('DOMContentLoaded', async () => {
      document.getElementById('dueOnly').onchange = setDueCards;
      loadCard(0);
      await AccountManager.ready;
      if (new URLSearchParams(location.search).get('review') === 'today') { document.getElementById('dueOnly').checked = true; setDueCards(); }
    });
