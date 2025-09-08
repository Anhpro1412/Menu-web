// Đăng nhập đơn giản, tài khoản: admin, mật khẩu: dhafood2025
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'dhafood2025';
const loginBox = document.getElementById('login-box');
const adminApp = document.getElementById('admin-app');
document.getElementById('login-form').onsubmit = function(e) {
  e.preventDefault();
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  if(u===ADMIN_USER && p===ADMIN_PASS){
    loginBox.style.display = 'none';
    adminApp.style.display = '';
  }else{
    document.getElementById('login-err').textContent = 'Sai tài khoản hoặc mật khẩu!';
  }
};
// API endpoint
const API = 'http://localhost:3001/api/admin';
let orders = [], menu = [], customers = [];
async function fetchOrders() {
  const res = await fetch(API + '/orders');
  const data = await res.json();
  orders = (data.orders || []).map(o => ({
    id: o.orderCode,
    customer: o.customerName,
    phone: o.customerPhone,
    total: o.total,
    createdAt: o.createdAt,
    items: o.items || ''
  }));
}
async function fetchMenu() {
  const res = await fetch(API + '/menu');
  const data = await res.json();
  menu = data.menu || [];
}
async function fetchCustomers() {
  const res = await fetch(API + '/customers');
  const data = await res.json();
  customers = data.customers || [];
}
async function renderOrders() {
  await fetchOrders();
  let html = `<h2>Đơn hàng</h2><table><tr><th>Mã đơn</th><th>Khách</th><th>Điện thoại</th><th>Tổng</th><th>Thời gian</th><th>Món</th></tr>`;
  for (const o of orders) {
    html += `<tr><td>${o.id}</td><td>${o.customer}</td><td>${o.phone}</td><td>${(o.total||0).toLocaleString('vi-VN')}₫</td><td>${o.createdAt}</td><td>${o.items||''}</td></tr>`;
  }
  html += `</table>`;
  document.getElementById('content').innerHTML = html;
}
async function renderMenu() {
  await fetchMenu();
  let html = `<h2>Menu món ăn</h2><form class="add-form" onsubmit="return false;"><input id="m-name" placeholder="Tên món" required><input id="m-price" type="number" placeholder="Giá" required><select id="m-cat"><option value="banhmi">Bánh mì</option><option value="pho">Phở</option><option value="nuoc">Đồ uống</option></select><input id="m-desc" placeholder="Mô tả"><button id="add-menu">Thêm</button></form><table><tr><th>Tên món</th><th>Giá</th><th>Loại</th><th>Mô tả</th></tr>`;
  for (let i=0; i<menu.length; ++i) {
    const m = menu[i];
    html += `<tr><td>${m.name}</td><td>${(m.price||0).toLocaleString('vi-VN')}₫</td><td>${m.cat}</td><td>${m.desc||''}</td></tr>`;
  }
  html += `</table>`;
  document.getElementById('content').innerHTML = html;
  document.getElementById('add-menu').onclick = async function() {
    const name = document.getElementById('m-name').value.trim();
    const price = Number(document.getElementById('m-price').value);
    const cat = document.getElementById('m-cat').value;
    const desc = document.getElementById('m-desc').value.trim();
    if (name && price) {
      await fetch(API + '/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, cat, desc })
      });
      renderMenu();
    }
  };
}
async function renderCustomers() {
  await fetchCustomers();
  let html = `<h2>Khách hàng</h2><table><tr><th>Tên</th><th>Điện thoại</th></tr>`;
  for (const c of customers) {
    html += `<tr><td>${c.name}</td><td>${c.phone}</td></tr>`;
  }
  html += `</table>`;
  document.getElementById('content').innerHTML = html;
}
async function renderStats() {
  await fetchOrders();
  let totalOrders = orders.length;
  let totalRevenue = orders.reduce((sum, o) => sum + (o.total||0), 0);
  let html = `<h2>Thống kê</h2><p>Tổng số đơn: <b>${totalOrders}</b></p><p>Doanh thu: <b>${totalRevenue.toLocaleString('vi-VN')}₫</b></p>`;
  document.getElementById('content').innerHTML = html;
}
document.getElementById('tab-orders').onclick = function() {
  setActive(this); renderOrders();
};
document.getElementById('tab-menu').onclick = function() {
  setActive(this); renderMenu();
};
document.getElementById('tab-customers').onclick = function() {
  setActive(this); renderCustomers();
};
document.getElementById('tab-stats').onclick = function() {
  setActive(this); renderStats();
};
function setActive(btn) {
  for (const b of document.querySelectorAll('nav button')) b.classList.remove('active');
  btn.classList.add('active');
}
// Mặc định hiển thị đơn hàng
renderOrders();
