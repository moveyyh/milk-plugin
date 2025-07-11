// ==UserScript==
// @name            [银河奶牛]库存物品快速交易增强版(支持物品标记和分类管理)
// @namespace       https://github.com/moveyyh/milk-plugin
// @version         1.0.1
// @description     基于[银河奶牛]库存物品快速交易(支持右一左一快速操作)插件扩展。支持一键自动出售物品,当单击选择了物品,也就是展开了前往市场,然后按S键,就会自动卖右一,按A键就会自动挂左一。新增物品标记功能：支持卖一、卖0、买1三种标记类型，右键菜单操作，可拖拽管理窗口
// @author          yyh
// @license         MIT
// @icon            https://www.milkywayidle.com/favicon.svg
// @match           https://www.milkywayidle.com/game*
// @downloadURL  https://raw.githubusercontent.com/moveyyh/milk-plugin/refs/heads/main/autoSellEnhanced.js
// @updateURL    https://raw.githubusercontent.com/moveyyh/milk-plugin/refs/heads/main/autoSellEnhanced.js
// ==/UserScript==

(function () {
  'use strict';

  // 全局变量，用于取消操作
  let isOperating = false;

  // 物品标记数据存储
  const ITEM_MARKS_KEY = 'milkyway_item_marks';
  const EXECUTED_ITEMS_KEY = 'milkyway_executed_items';
  const MARK_TYPES = {
    SELL_ONE: 'sell_one',    // 卖一
    SELL_ZERO: 'sell_zero',  // 卖0
    BUY_ONE: 'buy_one'       // 买1
  };

  const MARK_COLORS = {
    [MARK_TYPES.SELL_ONE]: '#ff4444',   // 红色
    [MARK_TYPES.SELL_ZERO]: '#ffaa00',  // 橙色
    [MARK_TYPES.BUY_ONE]: '#44ff44'     // 绿色
  };

  const MARK_LABELS = {
    [MARK_TYPES.SELL_ONE]: '卖一',
    [MARK_TYPES.SELL_ZERO]: '卖0',
    [MARK_TYPES.BUY_ONE]: '买1'
  };

  // 物品标记存储管理
  class ItemMarkStorage {
    static get() {
      try {
        const data = localStorage.getItem(ITEM_MARKS_KEY);
        return data ? JSON.parse(data) : {};
      } catch (e) {
        console.error('读取物品标记数据失败:', e);
        return {};
      }
    }

    static set(marks) {
      try {
        localStorage.setItem(ITEM_MARKS_KEY, JSON.stringify(marks));
        return true;
      } catch (e) {
        console.error('保存物品标记数据失败:', e);
        return false;
      }
    }

    static setItemMark(itemName, markType) {
      const marks = this.get();
      if (markType) {
        marks[itemName] = markType;
      } else {
        delete marks[itemName];
      }
      return this.set(marks);
    }

    static getItemMark(itemName) {
      const marks = this.get();
      return marks[itemName] || null;
    }

    static removeItemMark(itemName) {
      return this.setItemMark(itemName, null);
    }
  }

  // 已执行物品存储管理
  class ExecutedItemsStorage {
    static get() {
      try {
        const data = localStorage.getItem(EXECUTED_ITEMS_KEY);
        return data ? JSON.parse(data) : {};
      } catch (e) {
        console.error('读取已执行物品数据失败:', e);
        return {};
      }
    }

    static set(executedItems) {
      try {
        localStorage.setItem(EXECUTED_ITEMS_KEY, JSON.stringify(executedItems));
        return true;
      } catch (e) {
        console.error('保存已执行物品数据失败:', e);
        return false;
      }
    }

    static addExecutedItem(itemName, markType, price) {
      const executedItems = this.get();
      executedItems[itemName] = {
        markType: markType,
        price: price,
        executedAt: new Date().toISOString()
      };
      return this.set(executedItems);
    }

    static removeExecutedItem(itemName) {
      const executedItems = this.get();
      delete executedItems[itemName];
      return this.set(executedItems);
    }

    static updateItemPrice(itemName, newPrice) {
      const executedItems = this.get();
      if (executedItems[itemName]) {
        executedItems[itemName].price = newPrice;
        executedItems[itemName].updatedAt = new Date().toISOString();
        return this.set(executedItems);
      }
      return false;
    }

    static clear() {
      return this.set({});
    }

    static isExecuted(itemName) {
      const executedItems = this.get();
      return !!executedItems[itemName];
    }
  }

  // 解析价格字符串，将K和M单位转换为数字
  function parsePrice(priceStr) {
    if (!priceStr || typeof priceStr !== 'string') return 0;
    
    const cleanPrice = priceStr.trim().toLowerCase();
    const numStr = cleanPrice.replace(/[km]/g, '');
    const num = parseFloat(numStr);
    
    if (isNaN(num)) return 0;
    
    if (cleanPrice.includes('k')) {
      return num * 1000;
    } else if (cleanPrice.includes('m')) {
      return num * 1000000;
    }
    return num;
  }

  // 获取物品名称
  function getItemName(itemElement) {
    try {
      const svgElement = itemElement.querySelector('svg[aria-label]');
      return svgElement ? svgElement.getAttribute('aria-label') : null;
    } catch (e) {
      console.error('获取物品名称失败:', e);
      return null;
    }
  }

  // 获取物品价格
  function getItemPrice(itemElement) {
    try {
      // 首先在物品元素内查找价格元素
      let priceElement = itemElement.querySelector('#script_stack_price');
      
      // 如果没找到，尝试在父容器中查找
      if (!priceElement) {
        const itemContainer = itemElement.closest('.Item_itemContainer__x7kH1');
        if (itemContainer) {
          priceElement = itemContainer.querySelector('#script_stack_price');
        }
      }
      
      // 如果还是没找到，尝试查找带有价格相关class的元素
      if (!priceElement) {
        priceElement = itemElement.querySelector('[id*="script_stack_price"], [class*="price"], [class*="stack_price"]');
      }
      
      if (priceElement) {
        const priceText = priceElement.textContent.trim();
        return parsePrice(priceText);
      }
      
      // 作为备选方案，查找是否有其他价格指示器
      const altPriceElement = itemElement.querySelector('.script_itemLevel');
      if (altPriceElement) {
        console.log(`物品 ${getItemName(itemElement)} 使用备选价格元素:`, altPriceElement.textContent);
      }
      
      return 0;
    } catch (e) {
      console.error('获取物品价格失败:', e);
      return 0;
    }
  }

  // 获取物品信息（名称和价格）
  function getItemInfo(itemElement) {
    return {
      name: getItemName(itemElement),
      price: getItemPrice(itemElement)
    };
  }

  // 模拟真实用户点击
  function simulateRealClick(element) {
      if (!element) return false;
      
      try {
          // 获取元素的位置和大小
          const rect = element.getBoundingClientRect();
          
          // 计算元素中心位置
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // 添加1-5像素的随机偏移
          const offsetX = (Math.random() * 10 - 5); // -5到5之间的随机偏移
          const offsetY = (Math.random() * 10 - 5); // -5到5之间的随机偏移
          
          // 最终点击位置 (确保不会超出元素边界)
          const clickX = Math.min(Math.max(centerX + offsetX, rect.left + 2), rect.right - 2);
          const clickY = Math.min(Math.max(centerY + offsetY, rect.top + 2), rect.bottom - 2);
          
          // 创建鼠标事件，添加位置信息
          const eventOptions = {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 1,
              clientX: clickX,
              clientY: clickY,
              screenX: clickX,
              screenY: clickY
          };
          
          const mouseDownEvent = new MouseEvent('mousedown', eventOptions);
          const mouseUpEvent = new MouseEvent('mouseup', eventOptions);
          const clickEvent = new MouseEvent('click', eventOptions);
          
          // 随机延迟模拟人类行为
          const delay1 = Math.floor(Math.random() * 20) + 10; // 10-30ms
          const delay2 = Math.floor(Math.random() * 30) + 20; // 20-50ms
          
          // 分发事件序列
          element.dispatchEvent(mouseDownEvent);
          
          setTimeout(() => {
              element.dispatchEvent(mouseUpEvent);
              
              setTimeout(() => {
                  element.dispatchEvent(clickEvent);
              }, delay2);
          }, delay1);
          
          return true;
      } catch (e) {
          console.error('模拟点击失败:', e);
          // 如果模拟失败，回退到普通点击
          try {
              element.click();
              return true;
          } catch (clickError) {
              console.error('普通点击也失败:', clickError);
              return false;
          }
      }
  }

  // 显示临时提示信息
  function showTemporaryMessage(message, duration = 3000) {
      // 移除之前可能存在的临时提示
      const existingMessage = document.getElementById('temporary-script-message');
      if (existingMessage) {
          existingMessage.remove();
      }

      // 创建提示元素
      const messageDiv = document.createElement('div');
      messageDiv.id = 'temporary-script-message';
      messageDiv.textContent = message;
      messageDiv.style.cssText = `
          position: fixed;
          top: 20%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 15px 25px;
          border-radius: 8px;
          z-index: 10000;
          font-size: 16px;
          opacity: 1;
          transition: opacity 0.5s ease-in-out;
          pointer-events: none; /* 不影响下方元素的点击 */
      `;

      // 添加到页面
      document.body.appendChild(messageDiv);

      // 设置定时器，duration毫秒后移除
      setTimeout(() => {
          messageDiv.style.opacity = '0'; // 淡出效果
          setTimeout(() => {
              messageDiv.remove();
          }, 500); // 等待淡出动画完成再移除
      }, duration);
  }

  // 添加物品标记指示器
  function addItemMarkIndicator(itemElement) {
    const itemName = getItemName(itemElement);
    if (!itemName) return;

    const itemContainer = itemElement.closest('.Item_itemContainer__x7kH1');
    if (!itemContainer) return;

    // 检查是否已有标记指示器
    const existingIndicator = itemContainer.querySelector('.item-mark-indicator');
    const markType = ItemMarkStorage.getItemMark(itemName);
    
    // 如果没有标记且没有指示器，直接返回
    if (!markType && !existingIndicator) {
      return;
    }

    // 如果有指示器但没有标记，移除指示器
    if (!markType && existingIndicator) {
      existingIndicator.remove();
      return;
    }

    // 如果指示器已存在且标记相同，无需更新
    if (existingIndicator && existingIndicator.dataset.markType === markType) {
      return;
    }

    // 移除旧的指示器
    if (existingIndicator) {
      existingIndicator.remove();
    }

    // 创建新的标记指示器
    const indicator = document.createElement('div');
    indicator.className = 'item-mark-indicator';
    indicator.dataset.markType = markType; // 保存标记类型以便比较
    indicator.textContent = MARK_LABELS[markType];
    indicator.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      background-color: ${MARK_COLORS[markType]};
      color: white;
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 0 0 4px 0;
      z-index: 10;
      pointer-events: none;
      font-weight: bold;
    `;

    // 确保父元素有相对定位
    itemContainer.style.position = 'relative';
    itemContainer.appendChild(indicator);
  }

  // 创建右键菜单
  function createContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'item-context-menu';
    menu.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 10001;
      display: none;
      min-width: 120px;
      font-family: Arial, sans-serif;
    `;

    const menuItems = [
      { type: MARK_TYPES.SELL_ONE, label: MARK_LABELS[MARK_TYPES.SELL_ONE], color: MARK_COLORS[MARK_TYPES.SELL_ONE] },
      { type: MARK_TYPES.SELL_ZERO, label: MARK_LABELS[MARK_TYPES.SELL_ZERO], color: MARK_COLORS[MARK_TYPES.SELL_ZERO] },
      { type: MARK_TYPES.BUY_ONE, label: MARK_LABELS[MARK_TYPES.BUY_ONE], color: MARK_COLORS[MARK_TYPES.BUY_ONE] },
      { type: null, label: '取消标记', color: '#666' }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
        font-size: 14px;
        color: ${item.color};
        font-weight: bold;
      `;
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', () => {
        handleContextMenuClick(item.type);
      });
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#f0f0f0';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = '';
      });
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);
    return menu;
  }

  let currentContextItem = null;
  const contextMenu = createContextMenu();

  // 处理右键菜单点击
  function handleContextMenuClick(markType) {
    if (currentContextItem) {
      const itemName = getItemName(currentContextItem);
      if (itemName) {
        ItemMarkStorage.setItemMark(itemName, markType);
        addItemMarkIndicator(currentContextItem);
        updateMarkManagerWindow();
        showTemporaryMessage(markType ? `已标记"${itemName}"为${MARK_LABELS[markType]}` : `已取消"${itemName}"的标记`);
      }
    }
    hideContextMenu();
  }

  // 显示右键菜单
  function showContextMenu(x, y, itemElement) {
    currentContextItem = itemElement;
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
  }

  // 隐藏右键菜单
  function hideContextMenu() {
    contextMenu.style.display = 'none';
    currentContextItem = null;
  }

  // 按键触发自动交易
  document.addEventListener('keydown', function (event) {
      if (event.key.toLowerCase() === 's') {
          event.preventDefault();
          if (!isOperating) {
              autoSell();
          }
      } else if (event.key.toLowerCase() === 'a') {
          event.preventDefault();
          if (!isOperating) {
              autoSellLeft();
          }
      } else if (event.key.toLowerCase() === 'm') {
          event.preventDefault();
          toggleMarkManagerWindow();
      } else if (event.key.toLowerCase() === 'b') {
          event.preventDefault();
          if (!batchSellInProgress && !isOperating) {
              batchSellMarkedItems();
          }
      } else if (isOperating || batchSellInProgress) {
          // 按下任意其他键取消操作
          if (batchSellInProgress) {
              cancelBatchSell();
          } else {
              isOperating = false;
              console.log('用户取消了操作');
              showTemporaryMessage('已取消操作', 3000);
          }
      }
  });

  // 查找按钮函数 - 根据按钮文本查找
  function findButtonByText(buttonText, container = document) {
      // 将buttonText转换为数组，支持"或"操作
      const textArray = Array.isArray(buttonText) ? buttonText : [buttonText];

      // 查找所有按钮元素
      const buttons = container.querySelectorAll('button');

      // 遍历所有按钮查找匹配文本的按钮
      for (const btn of buttons) {
          for (const text of textArray) {
              if (btn.textContent.includes(text)) {
                  return btn;
              }
          }
      }

      // 查找可能嵌套在其他元素中的按钮
      const elements = container.querySelectorAll('*');
      for (const el of elements) {
          for (const text of textArray) {
              if (el.textContent.trim() === text && el.querySelector('button')) {
                  return el.querySelector('button');
              }
          }
      }

      return null;
  }

  // 查找按钮函数 - 根据精确匹配的文本查找
  function findButtonByExactText(buttonText, container = document) {
      // 查找所有按钮元素
      const buttons = container.querySelectorAll('button');

      // 遍历所有按钮查找完全匹配文本的按钮
      for (const btn of buttons) {
          if (btn.textContent.trim() === buttonText) {
              return btn;
          }
      }

      // 查找可能嵌套在其他元素中的按钮
      const elements = container.querySelectorAll('*');
      for (const el of elements) {
          // 检查元素自身是否完全匹配
          if (el.childNodes.length === 1 && el.textContent.trim() === buttonText) {
              const nearestButton = el.closest('button');
              if (nearestButton) {
                  return nearestButton;
              }
          }

          // 检查元素内是否有完全匹配的文本节点
          const textNodes = Array.from(el.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
          for (const textNode of textNodes) {
              if (textNode.textContent.trim() === buttonText) {
                  const nearestButton = el.closest('button') || el.querySelector('button');
                  if (nearestButton) {
                      return nearestButton;
                  }
              }
          }
      }

      return null;
  }

  // 创建步骤对象 - 封装步骤逻辑
  function createStep(name, containerSelector, buttonTextOrArray, exactMatch = false, successCallback = null) {
      return {
          name: name,
          fn: () => {
              // 使用querySelectorAll查找所有匹配的容器元素
              const containers = document.querySelectorAll(containerSelector);
              if (containers.length === 0) {
                  return false;
              }
              
              // 遍历所有容器
              for (const container of containers) {
                  // 执行成功回调（如果有）
                  if (successCallback) {
                      const callbackResult = successCallback(container);
                      if (callbackResult === true) {
                          return true;
                      }
                  }

                  // 查找并点击按钮
                  const btn = exactMatch
                      ? findButtonByExactText(buttonTextOrArray, container)
                      : findButtonByText(buttonTextOrArray, container);

                  if (btn) {
                      // 使用模拟真实点击替代普通点击
                      return simulateRealClick(btn);
                  }
              }
              
              return false;
          }
      };
  }

  // 获取不同标记类型的步骤定义
  function getStepsForMarkType(markType) {
    switch (markType) {
      case MARK_TYPES.SELL_ONE:
        return [
          // 步骤1: 前往市场
          createStep('前往市场', '[class*="MuiTooltip-tooltip"]', '前往市场'),
          // 步骤2: 点击新出售挂牌
          createStep('新出售挂牌', '[class*="MarketplacePanel_orderBook"]', '新出售挂牌'),
          // 步骤3: 点击全部或检查已有最多
          createStep('点击全部', '[class*="MarketplacePanel_modalContent"]', ['全部', '最多']),
          // 步骤4: 点击"+"按钮（左一）
          createStep('点击加号', '[class*="MarketplacePanel_modalContent"]', '+'),
          // 步骤5: 发布出售订单
          createStep('发布出售订单', '[class*="MarketplacePanel_modalContent__"]', '发布出售')
        ];
      case MARK_TYPES.SELL_ZERO:
        return [
          // 步骤1: 前往市场
          createStep('前往市场', '[class*="MuiTooltip-tooltip"]', '前往市场'),
          // 步骤2: 点击新出售挂牌
          createStep('新出售挂牌', '[class*="MarketplacePanel_orderBook"]', '新出售挂牌'),
          // 步骤3: 点击全部或检查已有最多
          createStep('点击全部', '[class*="MarketplacePanel_modalContent"]', ['全部', '最多']),
          // 步骤4: 发布出售订单
          createStep('发布出售订单', '[class*="MarketplacePanel_modalContent__"]', '发布出售')
        ];
      case MARK_TYPES.BUY_ONE:
        return [
          // 步骤1: 前往市场
          createStep('前往市场', '[class*="MuiTooltip-tooltip"]', '前往市场'),
          // 步骤2: 点击出售
          createStep('点击出售', '[class*="MarketplacePanel_orderBook"]', '出售', true),
          // 步骤3: 点击全部或检查已有最多
          createStep('点击全部', '[class*="MarketplacePanel_modalContent"]', ['全部', '最多']),
          // 步骤4: 发布出售订单
          createStep('发布出售订单', '[class*="MarketplacePanel_modalContent__"]', '发布出售')
        ];
      default:
        return [];
    }
  }

  // 查找物品元素 - 在库存容器中查找
  function findItemElementByName(itemName) {
    // 首先查找库存容器
    const inventoryContainer = document.querySelector('.Inventory_items__6SXv0');
    if (!inventoryContainer) {
      console.warn('未找到库存容器');
      return null;
    }

    // 在库存容器中查找所有物品
    const items = inventoryContainer.querySelectorAll('.Item_item__2De2O');
    for (const item of items) {
      const name = getItemName(item);
      if (name === itemName) {
        return item;
      }
    }
    return null;
  }

  // 检查物品是否在库存中存在
  function isItemInInventory(itemName) {
    return findItemElementByName(itemName) !== null;
  }

  // 批量出售功能
  let batchSellInProgress = false;
  let batchSellStatus = null;

  // 对标记物品进行排序，按优先级：买一 > 卖0 > 卖一(按价格高低) > 已执行的物品(优先级最低)
  function sortMarkedItems(itemsToSell) {
    const priorityOrder = {
      [MARK_TYPES.BUY_ONE]: 1,
      [MARK_TYPES.SELL_ZERO]: 2,
      [MARK_TYPES.SELL_ONE]: 3
    };

    return itemsToSell.sort((a, b) => {
      const [nameA, markTypeA, priceA] = a;
      const [nameB, markTypeB, priceB] = b;
      
      // 检查是否已执行过
      const isExecutedA = ExecutedItemsStorage.isExecuted(nameA);
      const isExecutedB = ExecutedItemsStorage.isExecuted(nameB);
      
      // 已执行的物品优先级最低
      if (isExecutedA && !isExecutedB) return 1;
      if (!isExecutedA && isExecutedB) return -1;
      
      // 如果都是已执行或都是未执行，按原有逻辑排序
      const priorityA = priorityOrder[markTypeA] || 999;
      const priorityB = priorityOrder[markTypeB] || 999;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // 如果是同一类型的标记，卖一类型按价格从高到低排序
      if (markTypeA === MARK_TYPES.SELL_ONE && markTypeB === MARK_TYPES.SELL_ONE) {
        return priceB - priceA; // 价格高的优先
      }
      
      // 其他情况保持原顺序
      return 0;
    });
  }

  async function batchSellMarkedItems() {
    if (batchSellInProgress || isOperating) {
      showTemporaryMessage('已有操作正在进行中...', 3000);
      return;
    }

    batchSellInProgress = true;
    
    // 点击排序按钮以刷新价格
    try {
      const sortBtn = document.querySelector('#script_sortByAsk_btn');
      if (sortBtn) {
        simulateRealClick(sortBtn);
        console.log('已点击价格排序按钮，等待价格更新...');
        // 等待1秒让价格更新
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.warn('未找到价格排序按钮 #script_sortByAsk_btn');
      }
    } catch (e) {
      console.error('点击排序按钮失败:', e);
    }
    
    const marks = ItemMarkStorage.get();
    
    // 过滤出在库存中实际存在的物品，并获取价格信息
    const itemsWithInfo = [];
    for (const [itemName, markType] of Object.entries(marks)) {
      const itemElement = findItemElementByName(itemName);
      if (itemElement) {
        const itemInfo = getItemInfo(itemElement);
        itemsWithInfo.push([itemName, markType, itemInfo.price]);
      } else {
        console.warn(`物品 "${itemName}" 不在当前库存中，跳过`);
      }
    }

    if (itemsWithInfo.length === 0) {
      showTemporaryMessage('没有可出售的标记物品在当前库存中', 3000);
      batchSellInProgress = false;
      return;
    }

    // 按优先级排序
    const itemsToSell = sortMarkedItems(itemsWithInfo);

    // 初始化状态
    batchSellStatus = {
      total: itemsToSell.length,
      completed: 0,
      failed: 0,
      current: null
    };

    updateBatchSellProgress();

    console.log(`开始批量出售 ${itemsToSell.length} 个标记物品，按优先级排序：买一 > 卖0 > 卖一(价格高优先)`);
    
    // 显示排序后的物品列表
    itemsToSell.forEach(([itemName, markType, price], index) => {
      const priceStr = price >= 1000000 ? `${(price / 1000000).toFixed(1)}M` : 
                      price >= 1000 ? `${(price / 1000).toFixed(1)}k` : 
                      price.toString();
      console.log(`${index + 1}. ${itemName} (${MARK_LABELS[markType]}) - ${priceStr}`);
    });

    for (const [itemName, markType, price] of itemsToSell) {
      if (!batchSellInProgress) {
        showTemporaryMessage('批量出售已取消', 3000);
        break;
      }

      const priceStr = price >= 1000000 ? `${(price / 1000000).toFixed(1)}M` : 
                      price >= 1000 ? `${(price / 1000).toFixed(1)}k` : 
                      price.toString();
      
      batchSellStatus.current = `${itemName} (${priceStr})`;
      updateBatchSellProgress();

      console.log(`正在出售: ${itemName} (${MARK_LABELS[markType]}) - 价格: ${priceStr}`);

      // 确保在库存容器中查找物品
      const itemElement = findItemElementByName(itemName);
      if (!itemElement) {
        console.warn(`无法在库存中找到物品: ${itemName}`);
        batchSellStatus.failed++;
        continue;
      }

      // 检查库存容器是否可见/可交互
      const inventoryContainer = document.querySelector('.Inventory_items__6SXv0');
      if (!inventoryContainer || !inventoryContainer.offsetParent) {
        console.warn('库存容器不可见，无法进行操作');
        batchSellStatus.failed++;
        break;
      }

      // 清除之前选中的物品
      const previousSelected = document.querySelector('[class*="Item_selected__"]');
      if (previousSelected) {
        simulateRealClick(previousSelected);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // 点击选择物品
      console.log(`点击物品: ${itemName}`);
      if (!simulateRealClick(itemElement)) {
        console.warn(`无法点击物品: ${itemName}`);
        batchSellStatus.failed++;
        continue;
      }

      // 等待物品选中状态更新
      let selectionRetries = 0;
      const maxSelectionRetries = 10;
      let isSelected = false;

      while (selectionRetries < maxSelectionRetries && !isSelected) {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 检查是否选中了正确的物品
        const selectedElement = document.querySelector('[class*="Item_selected__"]');
        if (selectedElement) {
          const selectedItemName = getItemName(selectedElement);
          if (selectedItemName === itemName) {
            isSelected = true;
            console.log(`物品 "${itemName}" 已选中`);
          } else {
            console.log(`选中了错误的物品: "${selectedItemName}"，期望: "${itemName}"`);
            // 重新点击正确的物品
            simulateRealClick(itemElement);
          }
        } else {
          console.log(`物品 "${itemName}" 未选中，重试...`);
          // 重新点击
          simulateRealClick(itemElement);
        }
        
        selectionRetries++;
      }

      if (!isSelected) {
        console.warn(`物品 "${itemName}" 选中失败，跳过`);
        batchSellStatus.failed++;
        continue;
      }

      // 执行对应的出售步骤
      const steps = getStepsForMarkType(markType);
      if (steps.length === 0) {
        console.warn(`未知的标记类型: ${markType}`);
        batchSellStatus.failed++;
        continue;
      }

      isOperating = true;
      const success = await executeSteps(steps);
      isOperating = false;

      if (success) {
        batchSellStatus.completed++;
        console.log(`成功出售: ${itemName}`);
        
        // 记录已执行的卖一和卖0物品
        if (markType === MARK_TYPES.SELL_ONE || markType === MARK_TYPES.SELL_ZERO) {
          ExecutedItemsStorage.addExecutedItem(itemName, markType, price);
          console.log(`已记录执行的物品: ${itemName} (${MARK_LABELS[markType]})`);
        }
      } else {
        batchSellStatus.failed++;
        console.log(`出售失败: ${itemName}`);
      }

      // 等待交易完成，给UI时间更新
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // 完成批量出售
    batchSellInProgress = false;
    batchSellStatus.current = null;
    updateBatchSellProgress();

    const message = `批量出售完成！成功: ${batchSellStatus.completed}, 失败: ${batchSellStatus.failed}`;
    showTemporaryMessage(message, 5000);
    console.log(message);
  }

  // 更新批量出售进度
  function updateBatchSellProgress() {
    const progressDiv = document.getElementById('batch-sell-progress');
    if (!progressDiv) return;

    if (!batchSellStatus) {
      progressDiv.style.display = 'none';
      return;
    }

    progressDiv.style.display = 'block';
    const percentage = Math.round((batchSellStatus.completed + batchSellStatus.failed) / batchSellStatus.total * 100);
    
    progressDiv.innerHTML = `
      <div style="margin-bottom: 5px;">
        <strong>批量出售进度: ${percentage}%</strong>
      </div>
      <div style="background: #e0e0e0; height: 8px; border-radius: 4px; margin-bottom: 5px;">
        <div style="background: #4CAF50; height: 100%; width: ${percentage}%; border-radius: 4px; transition: width 0.3s;"></div>
      </div>
      <div style="font-size: 12px; color: #666;">
        ${batchSellStatus.current ? `当前: ${batchSellStatus.current}` : ''}
        <br>完成: ${batchSellStatus.completed} | 失败: ${batchSellStatus.failed} | 总计: ${batchSellStatus.total}
      </div>
    `;
  }

  // 取消批量出售
  function cancelBatchSell() {
    if (batchSellInProgress) {
      batchSellInProgress = false;
      isOperating = false;
      showTemporaryMessage('正在取消批量出售...', 3000);
    }
  }

  // 导入导出功能
  function exportMarksData() {
    try {
      const marks = ItemMarkStorage.get();
      const exportData = {
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        marks: marks,
        count: Object.keys(marks).length
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // 创建下载链接
      const link = document.createElement('a');
      link.href = url;
      link.download = `milkyway-marks-${new Date().toISOString().slice(0, 10)}.json`;
      
      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 清理URL对象
      URL.revokeObjectURL(url);

      showTemporaryMessage(`已导出 ${exportData.count} 个标记到文件`, 3000);
      console.log('标记数据导出成功:', exportData);
    } catch (error) {
      console.error('导出失败:', error);
      showTemporaryMessage('导出失败: ' + error.message, 3000);
    }
  }

  function importMarksData() {
    try {
      // 创建文件选择器
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';

      input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importData = JSON.parse(e.target.result);
            
            // 验证数据格式
            if (!validateImportData(importData)) {
              throw new Error('导入文件格式不正确');
            }

            // 询问用户是否要合并还是替换
            const shouldMerge = confirm('是否要合并标记数据？\n确定 = 合并（保留现有标记）\n取消 = 替换（清除现有标记）');
            
            let finalMarks = {};
            if (shouldMerge) {
              // 合并模式：保留现有标记，新数据覆盖重复项
              finalMarks = { ...ItemMarkStorage.get(), ...importData.marks };
            } else {
              // 替换模式：完全使用新数据
              finalMarks = importData.marks;
            }

            // 保存数据
            ItemMarkStorage.set(finalMarks);
            
            // 更新UI
            updateMarkManagerWindow();
            updateAllItemIndicators();

            const importCount = Object.keys(importData.marks).length;
            const finalCount = Object.keys(finalMarks).length;
            showTemporaryMessage(`导入成功！导入了 ${importCount} 个标记，当前共 ${finalCount} 个标记`, 5000);
            console.log('标记数据导入成功:', { importCount, finalCount, finalMarks });

          } catch (error) {
            console.error('导入解析失败:', error);
            showTemporaryMessage('导入失败: ' + error.message, 3000);
          }
        };

        reader.onerror = () => {
          showTemporaryMessage('文件读取失败', 3000);
        };

        reader.readAsText(file);
      });

      // 触发文件选择
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);

    } catch (error) {
      console.error('导入功能初始化失败:', error);
      showTemporaryMessage('导入功能初始化失败: ' + error.message, 3000);
    }
  }

  function validateImportData(data) {
    // 基本结构验证
    if (!data || typeof data !== 'object') {
      console.error('导入数据不是有效的对象');
      return false;
    }

    if (!data.marks || typeof data.marks !== 'object') {
      console.error('导入数据缺少marks字段或格式不正确');
      return false;
    }

    // 验证marks中的每个条目
    for (const [itemName, markType] of Object.entries(data.marks)) {
      if (typeof itemName !== 'string' || !itemName.trim()) {
        console.error('物品名称无效:', itemName);
        return false;
      }

      if (!Object.values(MARK_TYPES).includes(markType)) {
        console.error('标记类型无效:', markType, '有效类型:', Object.values(MARK_TYPES));
        return false;
      }
    }

    return true;
  }

  function clearAllMarks() {
    if (confirm('确定要清除所有标记吗？此操作不可撤销！')) {
      ItemMarkStorage.set({});
      updateMarkManagerWindow();
      updateAllItemIndicators();
      showTemporaryMessage('已清除所有标记', 3000);
      console.log('所有标记已清除');
    }
  }

  // 持续尝试执行步骤直到成功或超时
  async function tryExecuteStep(stepFn, stepName, timeout = 5000) {
      console.log(`尝试执行: ${stepName}`);
      return new Promise((resolve) => {
          const startTime = Date.now();

          // 使用requestAnimationFrame持续尝试
          function attemptStep() {
              if (!isOperating) {
                  resolve(false); // 用户取消了操作
                  return;
              }

              try {
                  const success = stepFn();
                  if (success) {
                      console.log(`成功: ${stepName}`);
                      resolve(true);
                      return;
                  }
              } catch (err) {
                  console.error(`执行错误 ${stepName}:`, err);
              }

              // 检查是否超时
              if (Date.now() - startTime > timeout) {
                  console.error(`超时: ${stepName}`);
                  resolve(false);
                  return;
              }

              // 继续尝试
              requestAnimationFrame(attemptStep);
          }

          attemptStep();
      });
  }

  // 执行一系列步骤
  async function executeSteps(steps) {
      for (let i = 0; i < steps.length; i++) {
          if (!isOperating) {
              showTemporaryMessage('操作已取消', 3000);
              break;
          }

          const step = steps[i];
          const success = await tryExecuteStep(step.fn, step.name);

          if (!success) {
              console.error(`步骤 ${i + 1} (${step.name}) 失败`);
              isOperating = false;
              showTemporaryMessage(`步骤 ${i + 1} (${step.name}) 失败: 请手动检查`, 3000);
              return false;
          }

          // 成功执行完一个步骤后等待一小段时间让UI更新
          await new Promise(resolve => setTimeout(resolve, 300));
      }

      return true;
  }

  // 自动交易流程 - 直接出售
  async function autoSell() {
      isOperating = true;

      // 检查是否选择了物品
      if (!document.querySelector('[class*="Item_selected__"]')) {
          // 将alert替换为showTemporaryMessage
          showTemporaryMessage('请先选择物品!', 3000);
          isOperating = false;
          return;
      }

      // 定义交易步骤
      const steps = [
          // 步骤1: 前往市场
          createStep('前往市场', '[class*="MuiTooltip-tooltip"]', '前往市场'),

          // 步骤2: 点击出售
          createStep('点击出售', '[class*="MarketplacePanel_orderBook"]', '出售', true),

          // 步骤3: 点击全部或检查已有最多
          createStep('点击全部', '[class*="MarketplacePanel_modalContent"]', ['全部', '最多']),

          // 步骤4: 发布出售订单
          createStep('发布出售订单', '[class*="MarketplacePanel_modalContent__"]', '发布出售')
      ];

      // 执行步骤
      const success = await executeSteps(steps);

      isOperating = false;
      if (success) {
          console.log('交易完成!');
          // 可以选择在这里也加一个完成提示
          // showTemporaryMessage('直接出售完成!', 3000);
      }
  }

  // 自动交易流程 - 挂左一
  async function autoSellLeft() {
      isOperating = true;

      // 检查是否选择了物品
      if (!document.querySelector('[class*="Item_selected__"]')) {
          // 替换alert，使用自定义函数显示3秒后自动消失的提示
          showTemporaryMessage('请先选择物品!', 3000); // 显示提示信息，持续3秒
          isOperating = false;
          return;
      }

      // 定义交易步骤
      const steps = [
          // 步骤1: 前往市场
          createStep('前往市场', '[class*="MuiTooltip-tooltip"]', '前往市场'),

          // 步骤2: 点击新出售挂牌
          createStep('新出售挂牌', '[class*="MarketplacePanel_orderBook"]', '新出售挂牌'),

          // 步骤3: 点击全部或检查已有最多
          createStep('点击全部', '[class*="MarketplacePanel_modalContent"]', ['全部', '最多']),

          // 步骤4: 点击"+"按钮（左一）
          createStep('点击加号', '[class*="MarketplacePanel_modalContent"]', '+'),

          // 步骤5: 发布出售订单
          createStep('发布出售订单', '[class*="MarketplacePanel_modalContent__"]', '发布出售')
      ];

      // 执行步骤
      const success = await executeSteps(steps);

      isOperating = false;
      if (success) {
          console.log('挂左一完成!');
          // 可以选择在这里也加一个完成提示
          // showTemporaryMessage('挂左一完成!', 3000);
      }
  }

  // 标记管理窗口相关
  let markManagerWindow = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  function createMarkManagerWindow() {
    const windowElement = document.createElement('div');
    windowElement.id = 'mark-manager-window';
    windowElement.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      width: 400px;
      background: white;
      border: 2px solid #333;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10002;
      font-family: Arial, sans-serif;
      display: none;
    `;

    // 创建标题栏
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      background: #333;
      color: white;
      padding: 8px 12px;
      cursor: move;
      border-radius: 6px 6px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    titleBar.innerHTML = `
      <span>物品标记管理</span>
      <div>
        <button id="minimize-btn" style="background: #666; color: white; border: none; padding: 2px 6px; margin-right: 4px; cursor: pointer; border-radius: 2px;">−</button>
        <button id="close-btn" style="background: #d33; color: white; border: none; padding: 2px 6px; cursor: pointer; border-radius: 2px;">×</button>
      </div>
    `;

    // 创建标签切换栏
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display: flex;
      background: #f0f0f0;
      border-bottom: 1px solid #ccc;
    `;
    
    const markingTab = document.createElement('button');
    markingTab.id = 'marking-tab';
    markingTab.textContent = '标记管理';
    markingTab.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      border: none;
      background: white;
      color: #007bff;
      cursor: pointer;
      border-bottom: 2px solid #007bff;
      font-weight: bold;
    `;
    
    const executedTab = document.createElement('button');
    executedTab.id = 'executed-tab';
    executedTab.textContent = '已执行记录';
    executedTab.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      border: none;
      background: #f0f0f0;
      color: #333;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    `;
    
    tabBar.appendChild(markingTab);
    tabBar.appendChild(executedTab);

    // 创建内容区域
    const content = document.createElement('div');
    content.id = 'mark-manager-content';
    content.style.cssText = `
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
    `;

    // 创建已执行物品内容区域
    const executedContent = document.createElement('div');
    executedContent.id = 'executed-items-content';
    executedContent.style.cssText = `
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
      display: none;
    `;

    // 创建批量操作按钮区域
    const batchActionsDiv = document.createElement('div');
    batchActionsDiv.style.cssText = `
      padding: 10px;
      border-bottom: 1px solid #eee;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    `;

    // 第一行：批量出售操作
    const sellActionsRow = document.createElement('div');
    sellActionsRow.style.cssText = `
      width: 100%;
      display: flex;
      gap: 8px;
    `;

    // 批量出售按钮
    const batchSellBtn = document.createElement('button');
    batchSellBtn.textContent = '批量出售标记物品';
    batchSellBtn.style.cssText = `
      background: #4CAF50;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      flex: 1;
    `;
    batchSellBtn.addEventListener('click', batchSellMarkedItems);

    // 取消批量出售按钮
    const cancelBatchBtn = document.createElement('button');
    cancelBatchBtn.textContent = '取消批量出售';
    cancelBatchBtn.style.cssText = `
      background: #f44336;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      flex: 1;
    `;
    cancelBatchBtn.addEventListener('click', cancelBatchSell);

    sellActionsRow.appendChild(batchSellBtn);
    sellActionsRow.appendChild(cancelBatchBtn);

    // 第二行：数据管理操作
    const dataActionsRow = document.createElement('div');
    dataActionsRow.style.cssText = `
      width: 100%;
      display: flex;
      gap: 8px;
      margin-top: 8px;
    `;

    // 导出按钮
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '导出标记';
    exportBtn.style.cssText = `
      background: #2196F3;
      color: white;
      border: none;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      flex: 1;
    `;
    exportBtn.addEventListener('click', exportMarksData);

    // 导入按钮
    const importBtn = document.createElement('button');
    importBtn.textContent = '导入标记';
    importBtn.style.cssText = `
      background: #FF9800;
      color: white;
      border: none;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      flex: 1;
    `;
    importBtn.addEventListener('click', importMarksData);

    // 清空按钮
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清空所有';
    clearBtn.style.cssText = `
      background: #9E9E9E;
      color: white;
      border: none;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      flex: 1;
    `;
    clearBtn.addEventListener('click', clearAllMarks);

    dataActionsRow.appendChild(exportBtn);
    dataActionsRow.appendChild(importBtn);
    dataActionsRow.appendChild(clearBtn);

    batchActionsDiv.appendChild(sellActionsRow);
    batchActionsDiv.appendChild(dataActionsRow);

    // 创建已执行物品操作按钮区域
    const executedActionsDiv = document.createElement('div');
    executedActionsDiv.id = 'executed-actions-div';
    executedActionsDiv.style.cssText = `
      padding: 10px;
      border-bottom: 1px solid #eee;
      display: none;
      gap: 8px;
    `;

    // 更新价格按钮
    const updatePricesBtn = document.createElement('button');
    updatePricesBtn.textContent = '更新所有价格';
    updatePricesBtn.style.cssText = `
      background: #17a2b8;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-right: 8px;
    `;
    updatePricesBtn.addEventListener('click', updateAllExecutedItemPrices);

    // 清空已执行记录按钮
    const clearExecutedBtn = document.createElement('button');
    clearExecutedBtn.textContent = '清空记录';
    clearExecutedBtn.style.cssText = `
      background: #dc3545;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    clearExecutedBtn.addEventListener('click', clearAllExecutedItems);

    executedActionsDiv.appendChild(updatePricesBtn);
    executedActionsDiv.appendChild(clearExecutedBtn);

    // 创建进度显示区域
    const progressDiv = document.createElement('div');
    progressDiv.id = 'batch-sell-progress';
    progressDiv.style.cssText = `
      padding: 10px;
      border-bottom: 1px solid #eee;
      display: none;
      background: #f8f9fa;
    `;

    windowElement.appendChild(titleBar);
    windowElement.appendChild(tabBar);
    windowElement.appendChild(batchActionsDiv);
    windowElement.appendChild(executedActionsDiv);
    windowElement.appendChild(progressDiv);
    windowElement.appendChild(content);
    windowElement.appendChild(executedContent);

    // 标签切换功能
    markingTab.addEventListener('click', () => {
      // 切换到标记管理
      markingTab.style.background = 'white';
      markingTab.style.color = '#007bff';
      markingTab.style.borderBottom = '2px solid #007bff';
      markingTab.style.fontWeight = 'bold';
      executedTab.style.background = '#f0f0f0';
      executedTab.style.color = '#333';
      executedTab.style.borderBottom = '2px solid transparent';
      executedTab.style.fontWeight = 'normal';
      
      content.style.display = 'block';
      executedContent.style.display = 'none';
      batchActionsDiv.style.display = 'block';
      executedActionsDiv.style.display = 'none';
    });

    executedTab.addEventListener('click', () => {
      // 切换到已执行记录
      executedTab.style.background = 'white';
      executedTab.style.color = '#007bff';
      executedTab.style.borderBottom = '2px solid #007bff';
      executedTab.style.fontWeight = 'bold';
      markingTab.style.background = '#f0f0f0';
      markingTab.style.color = '#333';
      markingTab.style.borderBottom = '2px solid transparent';
      markingTab.style.fontWeight = 'normal';
      
      content.style.display = 'none';
      executedContent.style.display = 'block';
      batchActionsDiv.style.display = 'none';
      executedActionsDiv.style.display = 'block';
      
      // 刷新已执行物品列表
      updateExecutedItemsList();
    });

    // 拖拽功能
    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      const rect = windowElement.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      windowElement.style.left = (e.clientX - dragOffset.x) + 'px';
      windowElement.style.top = (e.clientY - dragOffset.y) + 'px';
      windowElement.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // 按钮事件
    titleBar.querySelector('#minimize-btn').addEventListener('click', () => {
      const isMinimized = content.style.display === 'none';
      content.style.display = isMinimized ? 'block' : 'none';
      titleBar.querySelector('#minimize-btn').textContent = isMinimized ? '−' : '+';
    });

    titleBar.querySelector('#close-btn').addEventListener('click', () => {
      windowElement.style.display = 'none';
    });

    document.body.appendChild(windowElement);
    return windowElement;
  }

  // 更新已执行物品列表
  function updateExecutedItemsList() {
    if (!markManagerWindow) return;

    const executedContent = markManagerWindow.querySelector('#executed-items-content');
    const executedItems = ExecutedItemsStorage.get();
    
    executedContent.innerHTML = '';

    if (Object.keys(executedItems).length === 0) {
      executedContent.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">暂无已执行记录</div>';
      return;
    }

    // 按价格降序排序
    const sortedItems = Object.entries(executedItems).sort((a, b) => {
      return b[1].price - a[1].price;
    });

    sortedItems.forEach(([itemName, itemData]) => {
      const itemDiv = document.createElement('div');
      itemDiv.style.cssText = `
        padding: 8px;
        margin: 4px 0;
        background: #f8f9fa;
        border-radius: 4px;
        border-left: 4px solid ${MARK_COLORS[itemData.markType]};
      `;
      
      const priceStr = itemData.price >= 1000000 ? `${(itemData.price / 1000000).toFixed(1)}M` : 
                      itemData.price >= 1000 ? `${(itemData.price / 1000).toFixed(1)}k` : 
                      itemData.price.toString();
      
      const executedDate = new Date(itemData.executedAt).toLocaleString('zh-CN');
      const updatedInfo = itemData.updatedAt ? 
        `，更新于：${new Date(itemData.updatedAt).toLocaleString('zh-CN')}` : '';

      itemDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div style="font-weight: bold; color: ${MARK_COLORS[itemData.markType]};">
              ${itemName} (${MARK_LABELS[itemData.markType]})
            </div>
            <div style="font-size: 12px; color: #666;">
              价格: ${priceStr} | 执行于：${executedDate}${updatedInfo}
            </div>
          </div>
          <div>
            <button class="update-price-btn" data-item="${itemName}" style="
              background: #28a745;
              color: white;
              border: none;
              padding: 4px 8px;
              margin-left: 4px;
              cursor: pointer;
              border-radius: 2px;
              font-size: 11px;
            ">更新价格</button>
            <button class="remove-executed-btn" data-item="${itemName}" style="
              background: #dc3545;
              color: white;
              border: none;
              padding: 4px 8px;
              margin-left: 4px;
              cursor: pointer;
              border-radius: 2px;
              font-size: 11px;
            ">删除</button>
          </div>
        </div>
      `;

      executedContent.appendChild(itemDiv);
    });

    // 添加按钮事件监听
    executedContent.querySelectorAll('.update-price-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemName = e.target.dataset.item;
        updateSingleItemPrice(itemName);
      });
    });

    executedContent.querySelectorAll('.remove-executed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemName = e.target.dataset.item;
        removeSingleExecutedItem(itemName);
      });
    });
  }

  // 更新单个物品价格
  async function updateSingleItemPrice(itemName) {
    // 点击排序按钮以刷新价格
    try {
      const sortBtn = document.querySelector('#script_sortByAsk_btn');
      if (sortBtn) {
        simulateRealClick(sortBtn);
        console.log('已点击价格排序按钮，等待价格更新...');
        // 等待1秒让价格更新
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.warn('未找到价格排序按钮 #script_sortByAsk_btn');
      }
    } catch (e) {
      console.error('点击排序按钮失败:', e);
    }
    
    const itemElement = findItemElementByName(itemName);
    if (itemElement) {
      const newPrice = getItemPrice(itemElement);
      ExecutedItemsStorage.updateItemPrice(itemName, newPrice);
      updateExecutedItemsList();
      
      const priceStr = newPrice >= 1000000 ? `${(newPrice / 1000000).toFixed(1)}M` : 
                      newPrice >= 1000 ? `${(newPrice / 1000).toFixed(1)}k` : 
                      newPrice.toString();
      showTemporaryMessage(`已更新"${itemName}"价格为${priceStr}`, 3000);
    } else {
      showTemporaryMessage(`物品"${itemName}"不在当前库存中`, 3000);
    }
  }

  // 更新所有已执行物品价格
  async function updateAllExecutedItemPrices() {
    // 点击排序按钮以刷新价格
    try {
      const sortBtn = document.querySelector('#script_sortByAsk_btn');
      if (sortBtn) {
        simulateRealClick(sortBtn);
        console.log('已点击价格排序按钮，等待价格更新...');
        // 等待1秒让价格更新
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.warn('未找到价格排序按钮 #script_sortByAsk_btn');
      }
    } catch (e) {
      console.error('点击排序按钮失败:', e);
    }
    
    const executedItems = ExecutedItemsStorage.get();
    let updatedCount = 0;
    
    Object.keys(executedItems).forEach(itemName => {
      const itemElement = findItemElementByName(itemName);
      if (itemElement) {
        const newPrice = getItemPrice(itemElement);
        ExecutedItemsStorage.updateItemPrice(itemName, newPrice);
        updatedCount++;
      }
    });
    
    updateExecutedItemsList();
    showTemporaryMessage(`已更新${updatedCount}个物品的价格`, 3000);
  }

  // 删除单个已执行记录
  function removeSingleExecutedItem(itemName) {
    if (confirm(`确定要删除"${itemName}"的执行记录吗？`)) {
      ExecutedItemsStorage.removeExecutedItem(itemName);
      updateExecutedItemsList();
      showTemporaryMessage(`已删除"${itemName}"的执行记录`, 3000);
    }
  }

  // 清空所有已执行记录
  function clearAllExecutedItems() {
    if (confirm('确定要清空所有执行记录吗？此操作不可撤销！')) {
      ExecutedItemsStorage.clear();
      updateExecutedItemsList();
      showTemporaryMessage('已清空所有执行记录', 3000);
    }
  }

  function updateMarkManagerWindow() {
    if (!markManagerWindow) return;

    const content = markManagerWindow.querySelector('#mark-manager-content');
    const marks = ItemMarkStorage.get();
    
    // 按标记类型分组
    const groupedMarks = {};
    Object.entries(marks).forEach(([itemName, markType]) => {
      if (!groupedMarks[markType]) {
        groupedMarks[markType] = [];
      }
      groupedMarks[markType].push(itemName);
    });

    content.innerHTML = '';

    if (Object.keys(marks).length === 0) {
      content.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">暂无标记物品</div>';
      return;
    }

    // 显示各类型的标记物品
    Object.values(MARK_TYPES).forEach(markType => {
      if (groupedMarks[markType] && groupedMarks[markType].length > 0) {
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom: 15px;';

        const header = document.createElement('div');
        header.style.cssText = `
          font-weight: bold;
          color: ${MARK_COLORS[markType]};
          margin-bottom: 5px;
          padding: 5px;
          background: ${MARK_COLORS[markType]}20;
          border-radius: 4px;
        `;
        header.textContent = `${MARK_LABELS[markType]} (${groupedMarks[markType].length})`;

        const itemList = document.createElement('div');
        groupedMarks[markType].forEach(itemName => {
          const itemDiv = document.createElement('div');
          itemDiv.style.cssText = `
            padding: 4px 8px;
            margin: 2px 0;
            background: #f5f5f5;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
          `;
          
          const nameSpan = document.createElement('span');
          nameSpan.textContent = itemName;
          nameSpan.style.flex = '1';

          const actionsDiv = document.createElement('div');
          
          // 修改标记按钮
          Object.values(MARK_TYPES).forEach(newMarkType => {
            if (newMarkType !== markType) {
              const changeBtn = document.createElement('button');
              changeBtn.textContent = MARK_LABELS[newMarkType];
              changeBtn.style.cssText = `
                background: ${MARK_COLORS[newMarkType]};
                color: white;
                border: none;
                padding: 2px 6px;
                margin-left: 2px;
                cursor: pointer;
                border-radius: 2px;
                font-size: 10px;
              `;
              changeBtn.addEventListener('click', () => {
                ItemMarkStorage.setItemMark(itemName, newMarkType);
                updateMarkManagerWindow();
                updateAllItemIndicators();
              });
              actionsDiv.appendChild(changeBtn);
            }
          });

          // 删除标记按钮
          const removeBtn = document.createElement('button');
          removeBtn.textContent = '×';
          removeBtn.style.cssText = `
            background: #666;
            color: white;
            border: none;
            padding: 2px 6px;
            margin-left: 2px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 10px;
          `;
          removeBtn.addEventListener('click', () => {
            ItemMarkStorage.removeItemMark(itemName);
            updateMarkManagerWindow();
            updateAllItemIndicators();
          });
          actionsDiv.appendChild(removeBtn);

          itemDiv.appendChild(nameSpan);
          itemDiv.appendChild(actionsDiv);
          itemList.appendChild(itemDiv);
        });

        section.appendChild(header);
        section.appendChild(itemList);
        content.appendChild(section);
      }
    });
  }

  function toggleMarkManagerWindow() {
    if (!markManagerWindow) {
      markManagerWindow = createMarkManagerWindow();
    }
    
    const isVisible = markManagerWindow.style.display !== 'none';
    markManagerWindow.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
      updateMarkManagerWindow();
    }
  }

  // 更新所有物品的标记指示器
  function updateAllItemIndicators() {
    // 只在库存容器中查找物品
    const inventoryContainer = document.querySelector('.Inventory_items__6SXv0');
    if (!inventoryContainer) {
      console.warn('未找到库存容器，无法更新物品标记');
      return;
    }

    const items = inventoryContainer.querySelectorAll('.Item_item__2De2O');
    items.forEach(item => {
      addItemMarkIndicator(item);
    });
  }

  // 页面加载完成后初始化
  function initializeScript() {
    // 监听右键点击事件
    document.addEventListener('contextmenu', (e) => {
      const itemElement = e.target.closest('.Item_item__2De2O');
      if (itemElement) {
        e.preventDefault();
        const itemName = getItemName(itemElement);
        if (itemName) {
          showContextMenu(e.clientX, e.clientY, itemElement);
        }
      } else {
        hideContextMenu();
      }
    });

    // 监听点击事件隐藏右键菜单
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#item-context-menu')) {
        hideContextMenu();
      }
    });

    // 使用更精确的MutationObserver避免死循环，专注于库存容器
    let updateTimeout = null;
    const observer = new MutationObserver((mutations) => {
      // 检查是否有新的物品容器添加，专注于库存区域
      const hasNewItems = mutations.some(mutation => {
        if (mutation.type !== 'childList') return false;
        
        // 检查变化是否发生在库存容器内
        const inventoryContainer = document.querySelector('.Inventory_items__6SXv0');
        if (!inventoryContainer) return false;
        
        // 检查变化是否在库存容器内或就是库存容器本身
        const isInventoryChange = inventoryContainer.contains(mutation.target) || 
                                 mutation.target === inventoryContainer;
        
        if (!isInventoryChange) return false;
        
        return Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          
          // 排除标记指示器和脚本创建的元素
          if (node.classList?.contains('item-mark-indicator') ||
              node.id === 'mark-manager-window' ||
              node.id === 'item-context-menu' ||
              node.id === 'temporary-script-message') {
            return false;
          }
          
          // 检查是否是新的物品容器或包含物品容器的元素
          return node.classList?.contains('Item_itemContainer__x7kH1') ||
                 node.classList?.contains('Inventory_itemGrid__20YAH') ||
                 node.querySelector?.('.Item_itemContainer__x7kH1');
        });
      });

      if (hasNewItems) {
        // 防抖处理，避免频繁更新
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          updateAllItemIndicators();
        }, 300);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初始更新
    setTimeout(updateAllItemIndicators, 1000);
  }

  // 等待页面加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeScript);
  } else {
    initializeScript();
  }

  console.log('牛牛快速交易增强版脚本已加载！');
  console.log('快捷键:');
  console.log('- S键: 直接出售');
  console.log('- A键: 挂左一');
  console.log('- M键: 打开/关闭标记管理窗口');
  console.log('- B键: 批量出售标记物品');
  console.log('- 右键物品: 标记物品');
  console.log('- 其他键: 取消当前操作');
  console.log('');
  console.log('管理窗口功能:');
  console.log('- 批量出售: 自动出售所有标记物品（按优先级：买一 > 卖0 > 卖一，卖一按价格高低排序，已执行的物品优先级最低）');
  console.log('- 导出标记: 将标记数据导出为JSON文件');
  console.log('- 导入标记: 从JSON文件导入标记数据');
  console.log('- 清空所有: 清除所有物品标记');
  console.log('');
  console.log('已执行记录功能:');
  console.log('- 自动记录卖一和卖0类型的已执行物品');
  console.log('- 更新价格: 单个或批量更新已执行物品的价格');
  console.log('- 删除记录: 单个删除或清空所有已执行记录');
  console.log('- 优先级: 已执行的物品在批量出售时排在最后');
})();