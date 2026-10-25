let activeCategory = 'all';

    function initResourcesPage() {
      renderCategoryFilters();
      renderResources();
    }

    function renderCategoryFilters() {
      const container = document.getElementById('categoryFilterContainer');
      if (!container || !RESOURCES_DATA) return;
      container.innerHTML = '';

      RESOURCES_DATA.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${cat.id === activeCategory ? 'btn-primary' : 'btn-outline'}`;
        btn.textContent = cat.name;
        btn.onclick = () => {
          activeCategory = cat.id;
          document.querySelectorAll('#categoryFilterContainer button').forEach(b => {
            b.className = 'btn btn-sm btn-outline';
          });
          btn.className = 'btn btn-sm btn-primary';
          filterResources();
        };
        container.appendChild(btn);
      });
    }

    function renderResources() {
      const container = document.getElementById('resourcesListContainer');
      if (!container || !RESOURCES_DATA) return;

      const q = (document.getElementById('resSearchInput')?.value || '').toLowerCase().trim();
      container.innerHTML = '';

      const filtered = RESOURCES_DATA.items.filter(item => {
        const matchesCat = activeCategory === 'all' || item.category === activeCategory;
        const matchesQuery = !q || 
          item.title.toLowerCase().includes(q) || 
          item.summary.toLowerCase().includes(q) || 
          (item.examTip && item.examTip.toLowerCase().includes(q));
        return matchesCat && matchesQuery;
      });

      const printButton = document.querySelector('[data-click="printAcademicDocument"]');
      if (printButton) printButton.disabled = filtered.length === 0;

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 40px; background: var(--gray-card); border-radius: var(--radius-md); border: 1px solid var(--gray-border);">
            <h4>لم يتم العثور على مراجع مطابقة</h4>
            <p style="color: var(--text-muted); font-size: 0.9rem;">جرب كتابة كلمات بحث أخرى أو اختر فئة مختلفة من الأعلى.</p>
          </div>
        `;
        return;
      }

      filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'res-card';
        card.id = `card_${item.id}`;

        let bodyHTML = '';

        // Keypoints
        if (item.keyPoints && item.keyPoints.length > 0) {
          bodyHTML += '<ul class="res-keypoints-list">';
          item.keyPoints.forEach(kp => {
            bodyHTML += `<li>${kp}</li>`;
          });
          bodyHTML += '</ul>';
        }

        // Matrix Table
        if (item.matrixData) {
          bodyHTML += `
            <div class="matrix-table-wrap">
              <table class="matrix-table">
                <thead>
                  <tr>
                    ${item.matrixData.headers.map(h => `<th>${h}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${item.matrixData.rows.map(row => `
                    <tr>
                      ${row.map(cell => `<td>${cell}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
        }

        // Cheat List
        if (item.cheatList && item.cheatList.length > 0) {
          bodyHTML += '<div class="cheat-grid">';
          item.cheatList.forEach(cl => {
            bodyHTML += `
              <div class="cheat-item-card">
                <strong>${cl.name}</strong>
                <p>${cl.desc}</p>
              </div>
            `;
          });
          bodyHTML += '</div>';
        }

        // Exam Tip
        if (item.examTip) {
          bodyHTML += `
            <div class="exam-tip-box">
              <span style="font-size: 1.1rem;">💡</span>
              <div>
                <strong>إضاءة وتوجيه للاختبار:</strong> ${item.examTip}
              </div>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="res-card-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main);">${item.title}</h3>
              <span class="res-badge">${item.badge}</span>
            </div>
            <span style="font-size: 0.84rem; color: var(--text-muted);">${item.type}</span>
          </div>

          <p style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.7; margin-bottom: 15px;">
            ${item.summary}
          </p>

          <div class="res-card-body" id="body_${item.id}">
            ${bodyHTML}
          </div>
        `;

        container.appendChild(card);
      });
    }

    function filterResources() {
      renderResources();
    }

    function expandAllResCards() {
      document.querySelectorAll('.res-card-body').forEach(b => b.style.display = 'block');
      showToast('📖 تم فتح كافة تفاصيل المراجع.');
    }

    function collapseAllResCards() {
      document.querySelectorAll('.res-card-body').forEach(b => b.style.display = 'none');
      showToast('📁 تم طي تفاصيل المراجع.');
    }

    document.addEventListener('DOMContentLoaded', () => {
      initResourcesPage();
    });
