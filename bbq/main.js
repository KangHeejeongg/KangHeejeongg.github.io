const rootElement = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const sheetCloseMs = 230;

rootElement.classList.add('js');

/**
 * Chromium 계열에서만 굴절 효과를 켠다.
 * @returns {void}
 */
function enableRefraction() {
  const isChromium = Boolean(navigator.userAgentData);
  if (isChromium && CSS.supports('backdrop-filter', 'url(#liquidGlass)')) {
    rootElement.classList.add('refract');
  }
}

/**
 * 제목을 글자 단위로 나누어 순차 등장 애니메이션을 준비한다.
 * @param {HTMLElement} heading 제목 요소
 * @returns {void}
 */
function splitHeading(heading) {
  let charIndex = 0;
  heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());

  /**
   * 텍스트 노드를 단어와 글자 요소로 바꾼다.
   * @param {Text} textNode 변환할 텍스트 노드
   * @returns {void}
   */
  const splitTextNode = (textNode) => {
    const fragment = document.createDocumentFragment();
    textNode.textContent.split(/(\s+)/).forEach((part) => {
      if (!part.trim()) {
        fragment.append(document.createTextNode(part));
        return;
      }
      const wordElement = document.createElement('span');
      wordElement.className = 'word';
      wordElement.setAttribute('aria-hidden', 'true');
      Array.from(part).forEach((character) => {
        const charElement = document.createElement('span');
        charElement.className = 'char';
        charElement.style.setProperty('--charIndex', String(charIndex));
        charElement.textContent = character;
        wordElement.append(charElement);
        charIndex += 1;
      });
      fragment.append(wordElement);
    });
    textNode.replaceWith(fragment);
  };

  /**
   * 하위 노드를 순서대로 순회하며 텍스트를 나눈다.
   * @param {Node} parentNode 순회할 부모 노드
   * @returns {void}
   */
  const walkNodes = (parentNode) => {
    Array.from(parentNode.childNodes).forEach((childNode) => {
      if (childNode.nodeType === Node.TEXT_NODE) {
        splitTextNode(childNode);
      } else if (childNode.nodeType === Node.ELEMENT_NODE) {
        walkNodes(childNode);
      }
    });
  };
  walkNodes(heading);
}

/**
 * 섹션에 들어올 때마다 내부 요소가 다시 등장하도록 설정한다.
 * @returns {void}
 */
function setupSectionReveal() {
  const sections = document.querySelectorAll('.hero, .wrap');
  document.querySelectorAll('.receipt li, .seals li').forEach((item) => item.classList.add('reveal'));
  sections.forEach((section) => {
    section.querySelectorAll('.reveal').forEach((item, itemIndex) => {
      item.style.setProperty('--order', String(itemIndex));
    });
  });
  if (!('IntersectionObserver' in window)) {
    sections.forEach((section) => section.classList.add('in-view'));
    return;
  }
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.intersectionRatio >= 0.2) {
        entry.target.classList.add('in-view');
      } else if (!entry.isIntersecting) {
        entry.target.classList.remove('in-view');
      }
    });
  }, { threshold: [0, 0.2] });
  sections.forEach((section) => sectionObserver.observe(section));
}

/**
 * 첫 화면이 스크롤에 따라 밀려나는 패럴랙스를 연결한다.
 * @returns {void}
 */
function setupHeroParallax() {
  let isQueued = false;

  /**
   * 현재 스크롤 위치를 CSS 변수에 반영한다.
   * @returns {void}
   */
  const applyShift = () => {
    isQueued = false;
    const heroShift = reducedMotion.matches ? 0 : Math.min(window.scrollY / window.innerHeight, 1);
    rootElement.style.setProperty('--heroShift', heroShift.toFixed(3));
  };
  window.addEventListener('scroll', () => {
    if (!isQueued) {
      isQueued = true;
      window.requestAnimationFrame(applyShift);
    }
  }, { passive: true });
  applyShift();
}

/**
 * 데스크톱에서 휠과 키보드 입력 한 번에 한 섹션씩 이동시킨다.
 * @returns {void}
 */
function setupSectionPaging() {
  const sections = Array.from(document.querySelectorAll('.hero, .wrap'));
  const moveMs = 620;
  const settleMs = 90;
  const gestureGapMs = 200;
  const heldScrollMs = 1200;
  const wheelNotchSize = 60;
  const gestureDistance = 36;
  const nextKeys = new Set(['ArrowDown', 'PageDown']);
  const previousKeys = new Set(['ArrowUp', 'PageUp']);
  let lockUntil = 0;
  let lastWheelTime = -Infinity;
  let lastMoveTime = -Infinity;
  let wheelDistance = 0;
  let isGestureArmed = true;
  let moveToken = 0;

  /**
   * 입력 방향에서 다음으로 이동할 섹션 번호를 찾는다.
   * @param {number} direction 이동 방향(1 또는 -1)
   * @returns {number} 섹션 번호, 없으면 -1
   */
  const findTargetIndex = (direction) => {
    const sectionTops = sections.map((section) => section.getBoundingClientRect().top);
    if (direction > 0) {
      return sectionTops.findIndex((sectionTop) => sectionTop > 2);
    }
    for (let sectionIndex = sectionTops.length - 1; sectionIndex >= 0; sectionIndex -= 1) {
      if (sectionTops[sectionIndex] < -2) {
        return sectionIndex;
      }
    }
    return -1;
  };

  /**
   * 화면보다 긴 섹션 안에 더 스크롤할 내용이 있는지 확인한다.
   * @param {number} direction 이동 방향(1 또는 -1)
   * @returns {boolean} 내부 스크롤 필요 여부
   */
  const hasRoomInside = (direction) => {
    const currentSection = sections.find((section) => {
      const sectionRect = section.getBoundingClientRect();
      return sectionRect.top <= 2 && sectionRect.bottom > 2;
    });
    if (!currentSection) {
      return false;
    }
    const sectionRect = currentSection.getBoundingClientRect();
    if (sectionRect.height <= window.innerHeight + 2) {
      return false;
    }
    return direction > 0 ? sectionRect.bottom > window.innerHeight + 2 : sectionRect.top < -2;
  };

  /**
   * 지정한 위치까지 부드럽게 이동한 뒤 스냅을 복원한다.
   * @param {number} targetTop 목표 스크롤 위치
   * @returns {void}
   */
  const animateScroll = (targetTop) => {
    moveToken += 1;
    const currentToken = moveToken;
    const startTop = window.scrollY;
    const startTime = performance.now();
    lockUntil = startTime + moveMs + settleMs;
    rootElement.classList.add('is-paging');

    /**
     * 이동을 마무리하고 스냅 상태를 되돌린다.
     * @returns {void}
     */
    const finishMove = () => {
      if (currentToken !== moveToken) {
        return;
      }
      window.scrollTo({ top: targetTop, behavior: 'instant' });
      rootElement.classList.remove('is-paging');
    };
    if (reducedMotion.matches) {
      finishMove();
      return;
    }

    /**
     * 시간에 맞춰 스크롤 위치를 갱신한다.
     * @param {number} frameTime 현재 프레임 시각
     * @returns {void}
     */
    const stepScroll = (frameTime) => {
      if (currentToken !== moveToken) {
        return;
      }
      const progress = Math.min((frameTime - startTime) / moveMs, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      window.scrollTo({ top: startTop + (targetTop - startTop) * easedProgress, behavior: 'instant' });
      if (progress < 1) {
        window.requestAnimationFrame(stepScroll);
      } else {
        finishMove();
      }
    };
    window.requestAnimationFrame(stepScroll);
    window.setTimeout(finishMove, moveMs + 160);
  };

  /**
   * 지정한 섹션으로 이동한다.
   * @param {number} sectionIndex 섹션 번호
   * @returns {void}
   */
  const goToSection = (sectionIndex) => {
    if (sectionIndex < 0 || sectionIndex >= sections.length) {
      return;
    }
    animateScroll(sections[sectionIndex].getBoundingClientRect().top + window.scrollY);
  };

  /**
   * 마우스 환경에서 페이지 단위 이동을 적용할지 판단한다.
   * @returns {boolean} 적용 여부
   */
  const canPage = () => finePointer.matches && !document.querySelector('.sheet[open]');

  window.addEventListener('wheel', (event) => {
    if (!canPage() || event.ctrlKey || event.deltaY === 0) {
      return;
    }
    const direction = Math.sign(event.deltaY);
    const currentTime = performance.now();
    if (currentTime >= lockUntil && hasRoomInside(direction)) {
      return;
    }
    event.preventDefault();
    const wheelSize = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 33 : 1);
    const wheelGap = currentTime - lastWheelTime;
    const isNewGesture = wheelGap > gestureGapMs;
    lastWheelTime = currentTime;
    if (currentTime < lockUntil) {
      isGestureArmed = false;
      wheelDistance = 0;
      return;
    }
    if (isNewGesture) {
      isGestureArmed = true;
      wheelDistance = 0;
    }
    wheelDistance += wheelSize;
    const isHeldScroll = currentTime - lastMoveTime >= heldScrollMs && wheelSize >= wheelNotchSize;
    if ((isGestureArmed && wheelDistance >= gestureDistance) || isHeldScroll) {
      isGestureArmed = false;
      wheelDistance = 0;
      lastMoveTime = currentTime;
      goToSection(findTargetIndex(direction));
    }
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (!canPage() || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.repeat && (nextKeys.has(event.key) || previousKeys.has(event.key))) {
      event.preventDefault();
      return;
    }
    const isSpace = event.key === ' ' && !event.target.closest('a, button');
    const isNext = nextKeys.has(event.key) || (isSpace && !event.shiftKey);
    const isPrevious = previousKeys.has(event.key) || (isSpace && event.shiftKey);
    const isEdgeKey = event.key === 'Home' || event.key === 'End';
    if (!isNext && !isPrevious && !isEdgeKey) {
      return;
    }
    const direction = isNext || event.key === 'End' ? 1 : -1;
    if (!isEdgeKey && hasRoomInside(direction)) {
      return;
    }
    event.preventDefault();
    if (performance.now() < lockUntil) {
      return;
    }
    if (isEdgeKey) {
      goToSection(event.key === 'Home' ? 0 : sections.length - 1);
    } else {
      goToSection(findTargetIndex(direction));
    }
  });

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    const targetElement = anchor && document.querySelector(anchor.getAttribute('href'));
    if (!targetElement || !finePointer.matches) {
      return;
    }
    event.preventDefault();
    goToSection(sections.findIndex((section) => section.contains(targetElement)));
    if (targetElement.classList.contains('menu-card')) {
      targetElement.classList.remove('is-target');
      window.setTimeout(() => {
        targetElement.classList.add('is-target');
        window.setTimeout(() => targetElement.classList.remove('is-target'), 1600);
      }, moveMs);
    }
  });
}

/**
 * 글래스 패널의 반사광과 카드 기울기를 포인터에 맞춘다.
 * @returns {void}
 */
function setupGlassPointer() {
  const glassItems = document.querySelectorAll('.menu-card, .side-card, .ticket, .ingredients > div, .contact, .seals li, .btn');
  glassItems.forEach((item) => {
    const canTilt = item.matches('.menu-card, .side-card');
    item.addEventListener('pointermove', (event) => {
      if (!finePointer.matches || reducedMotion.matches) {
        return;
      }
      const itemRect = item.getBoundingClientRect();
      const ratioX = (event.clientX - itemRect.left) / itemRect.width;
      const ratioY = (event.clientY - itemRect.top) / itemRect.height;
      item.style.setProperty('--mx', `${(ratioX * 100).toFixed(1)}%`);
      item.style.setProperty('--my', `${(ratioY * 100).toFixed(1)}%`);
      if (canTilt) {
        item.style.setProperty('--rx', `${((0.5 - ratioY) * 11).toFixed(2)}deg`);
        item.style.setProperty('--ry', `${((ratioX - 0.5) * 11).toFixed(2)}deg`);
      }
    });
    if (canTilt) {
      item.addEventListener('pointerleave', () => {
        item.style.setProperty('--rx', '0deg');
        item.style.setProperty('--ry', '0deg');
      });
    }
  });
}

/**
 * 버튼을 누른 위치에 물결 효과를 만든다.
 * @param {PointerEvent} event 포인터 이벤트
 * @returns {void}
 */
function addRipple(event) {
  const button = event.target.closest('.btn');
  if (!button || reducedMotion.matches) {
    return;
  }
  const buttonRect = button.getBoundingClientRect();
  const rippleElement = document.createElement('span');
  rippleElement.className = 'ripple';
  rippleElement.style.left = `${event.clientX - buttonRect.left}px`;
  rippleElement.style.top = `${event.clientY - buttonRect.top}px`;
  rippleElement.addEventListener('animationend', () => rippleElement.remove());
  button.append(rippleElement);
}

/**
 * 버튼과 연결된 메뉴 상세 시트를 연다.
 * @param {HTMLButtonElement} openButton 시트를 여는 버튼
 * @returns {void}
 */
function openSheet(openButton) {
  const sheet = document.getElementById(openButton.dataset.open);
  sheet.classList.remove('closing');
  sheet.showModal();
}

/**
 * 닫힘 애니메이션을 재생한 뒤 시트를 닫는다.
 * @param {HTMLDialogElement} sheet 메뉴 상세 시트
 * @returns {void}
 */
function closeSheet(sheet) {
  if (!sheet.open || sheet.classList.contains('closing')) {
    return;
  }
  if (reducedMotion.matches) {
    sheet.close();
    return;
  }
  sheet.classList.add('closing');
  window.setTimeout(() => sheet.close(), sheetCloseMs);
}

/**
 * 시트의 닫기 버튼, Esc, 배경 클릭 동작을 연결한다.
 * @param {HTMLDialogElement} sheet 메뉴 상세 시트
 * @returns {void}
 */
function bindSheetClose(sheet) {
  sheet.querySelector('.close').addEventListener('click', () => closeSheet(sheet));
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) {
      closeSheet(sheet);
    }
  });
  sheet.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeSheet(sheet);
  });
  sheet.addEventListener('close', () => sheet.classList.remove('closing'));
}

/**
 * 아이콘 이름으로 SVG 요소를 만든다.
 * @param {string} iconName 아이콘 이름
 * @param {string} className 적용할 클래스
 * @returns {SVGSVGElement} 아이콘 요소
 */
function createIcon(iconName, className) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const iconElement = document.createElementNS(svgNamespace, 'svg');
  const useElement = document.createElementNS(svgNamespace, 'use');
  iconElement.setAttribute('class', className);
  iconElement.setAttribute('aria-hidden', 'true');
  useElement.setAttribute('href', `assets/icons.svg#${iconName}`);
  iconElement.append(useElement);
  return iconElement;
}

/**
 * 상세 시트에 프로젝트 캐릭터와 단계별 아이콘을 넣는다.
 * @returns {void}
 */
function decorateSheets() {
  const stepIcons = { 문제: 'iconProblem', '내 역할': 'iconRole', 해결: 'iconFix', 구조: 'iconFlow', 검증: 'iconCheck' };
  document.querySelectorAll('.menu-card').forEach((card) => {
    const sheet = card.querySelector('.sheet');
    const chickenName = card.querySelector('.chicken use').getAttribute('href').split('#')[1];
    sheet.querySelector('.close').after(createIcon(chickenName, 'sheet-icon'));
    sheet.querySelectorAll('.recipe dt').forEach((stepTitle) => {
      stepTitle.prepend(createIcon(stepIcons[stepTitle.textContent.trim()], 'dt-icon'));
    });
  });
}

/**
 * 재사용할 유리 기포 이미지를 미리 그린다.
 * @returns {HTMLCanvasElement} 기포 스프라이트
 */
function createBubbleSprite() {
  const spriteSize = 128;
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteSize;
  spriteCanvas.height = spriteSize;
  const spriteContext = spriteCanvas.getContext('2d');
  const center = spriteSize / 2;
  const radius = center - 4;
  const bodyGradient = spriteContext.createRadialGradient(center * 0.72, center * 0.62, 2, center, center, radius);
  bodyGradient.addColorStop(0, 'rgba(255, 255, 255, .9)');
  bodyGradient.addColorStop(0.55, 'rgba(255, 226, 150, .16)');
  bodyGradient.addColorStop(1, 'rgba(246, 180, 47, .34)');
  spriteContext.fillStyle = bodyGradient;
  spriteContext.beginPath();
  spriteContext.arc(center, center, radius, 0, Math.PI * 2);
  spriteContext.fill();
  spriteContext.strokeStyle = 'rgba(236, 160, 40, .78)';
  spriteContext.lineWidth = 3.5;
  spriteContext.stroke();
  spriteContext.fillStyle = 'rgba(255, 255, 255, .95)';
  spriteContext.beginPath();
  spriteContext.ellipse(center * 0.66, center * 0.58, radius * 0.19, radius * 0.11, -0.7, 0, Math.PI * 2);
  spriteContext.fill();
  return spriteCanvas;
}

/**
 * 메인 이후 화면 뒤에 깔리는 보글보글 기포 배경을 실행한다.
 * @returns {void}
 */
function setupBubbleField() {
  const canvas = document.getElementById('bubbleCanvas');
  const context = canvas.getContext('2d');
  const hero = document.querySelector('.hero');
  const sprite = createBubbleSprite();
  const pointer = { x: -9999, y: -9999 };
  let bubbles = [];
  let popRings = [];
  let viewWidth = 0;
  let viewHeight = 0;
  let frameId = 0;
  let lastTime = 0;
  let isHeroCovering = true;

  /**
   * 기포 하나의 초기 상태를 만든다.
   * @param {boolean} scatterY 화면 전체에 흩뿌릴지 여부
   * @returns {object} 기포 상태
   */
  const createBubble = (scatterY) => {
    const radius = 4 + Math.random() ** 2.2 * 34;
    return {
      x: Math.random() * viewWidth,
      y: scatterY ? Math.random() * viewHeight : viewHeight + radius + Math.random() * 90,
      radius,
      speed: 34 + Math.random() * 62 + radius * 0.9,
      phase: Math.random() * Math.PI * 2,
      sway: 7 + Math.random() * 20,
      offsetX: 0,
      popAt: Math.random() * viewHeight * 0.34,
    };
  };

  /**
   * 화면 크기에 맞춰 캔버스와 기포 수를 조정한다.
   * @returns {void}
   */
  const resizeField = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;
    canvas.width = Math.round(viewWidth * pixelRatio);
    canvas.height = Math.round(viewHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const bubbleCount = Math.min(95, Math.round((viewWidth * viewHeight) / 15000));
    bubbles = Array.from({ length: bubbleCount }, () => createBubble(true));
    popRings = [];
  };

  /**
   * 기포가 터지는 고리 효과를 추가한다.
   * @param {number} x 가로 위치
   * @param {number} y 세로 위치
   * @param {number} radius 시작 반지름
   * @returns {void}
   */
  const addPopRing = (x, y, radius) => {
    popRings.push({ x, y, radius, life: 1 });
  };

  /**
   * 현재 기포와 고리를 캔버스에 그린다.
   * @returns {void}
   */
  const drawField = () => {
    context.clearRect(0, 0, viewWidth, viewHeight);
    bubbles.forEach((bubble) => {
      const drawX = bubble.x + bubble.offsetX + Math.sin(bubble.phase) * bubble.sway;
      const squash = 1 + Math.sin(bubble.phase * 2.2) * 0.07;
      const drawWidth = bubble.radius * 2 * squash;
      const drawHeight = (bubble.radius * 2) / squash;
      context.drawImage(sprite, drawX - drawWidth / 2, bubble.y - drawHeight / 2, drawWidth, drawHeight);
    });
    context.lineWidth = 2;
    popRings.forEach((ring) => {
      context.strokeStyle = `rgba(236, 160, 40, ${(ring.life * 0.75).toFixed(3)})`;
      context.beginPath();
      context.arc(ring.x, ring.y, ring.radius + (1 - ring.life) * 26, 0, Math.PI * 2);
      context.stroke();
    });
  };

  /**
   * 경과 시간만큼 기포 위치를 갱신한다.
   * @param {number} deltaSeconds 경과 시간(초)
   * @returns {void}
   */
  const updateField = (deltaSeconds) => {
    bubbles.forEach((bubble, bubbleIndex) => {
      bubble.y -= bubble.speed * deltaSeconds;
      bubble.phase += deltaSeconds * 2.1;
      const distanceX = bubble.x + bubble.offsetX - pointer.x;
      const distanceY = bubble.y - pointer.y;
      const distance = Math.hypot(distanceX, distanceY) || 1;
      if (distance < 130) {
        bubble.offsetX += (distanceX / distance) * (130 - distance) * deltaSeconds * 4;
      }
      bubble.offsetX *= 0.985;
      if (bubble.y < bubble.popAt) {
        addPopRing(bubble.x + bubble.offsetX, bubble.y, bubble.radius);
        bubbles[bubbleIndex] = createBubble(false);
      }
    });
    popRings = popRings.filter((ring) => {
      ring.life -= deltaSeconds * 2.6;
      return ring.life > 0;
    });
  };

  /**
   * 애니메이션 한 프레임을 실행한다.
   * @param {number} currentTime 현재 시각
   * @returns {void}
   */
  const renderFrame = (currentTime) => {
    const deltaSeconds = Math.min((currentTime - lastTime) / 1000 || 0, 0.05);
    lastTime = currentTime;
    updateField(deltaSeconds);
    drawField();
    frameId = window.requestAnimationFrame(renderFrame);
  };

  /**
   * 보이는 상태와 모션 설정에 따라 재생을 맞춘다.
   * @returns {void}
   */
  const syncPlayback = () => {
    const shouldRun = !isHeroCovering && !document.hidden && !reducedMotion.matches;
    if (shouldRun && !frameId) {
      lastTime = performance.now();
      frameId = window.requestAnimationFrame(renderFrame);
    } else if (!shouldRun && frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (!shouldRun) {
      drawField();
    }
  };

  resizeField();
  drawField();
  window.addEventListener('resize', () => {
    resizeField();
    drawField();
  });
  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, { passive: true });
  window.addEventListener('pointerdown', (event) => {
    if (reducedMotion.matches || hero.contains(event.target)) {
      return;
    }
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      addPopRing(event.clientX, event.clientY, 4 + ringIndex * 10);
    }
  }, { passive: true });
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', syncPlayback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      isHeroCovering = entry.intersectionRatio >= 0.98;
      syncPlayback();
    }, { threshold: [0, 0.98, 1] }).observe(hero);
  } else {
    isHeroCovering = false;
    syncPlayback();
  }
}

enableRefraction();
decorateSheets();
document.querySelectorAll('.hero h1, .section-head h2, .contact h2').forEach(splitHeading);
document.querySelectorAll('[data-open]').forEach((openButton) => {
  openButton.addEventListener('click', () => openSheet(openButton));
});
document.querySelectorAll('.sheet').forEach(bindSheetClose);
document.addEventListener('pointerdown', addRipple);
setupSectionReveal();
setupHeroParallax();
setupSectionPaging();
setupGlassPointer();
setupBubbleField();
