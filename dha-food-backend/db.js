// db.js - Kết nối SQL Server cho DHA Food
import fs from 'fs/promises';
const DATA_FILE = './data.json';

async function readData() {
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function getOrders() {
  const data = await readData();
  return data.orders || [];
}

export async function addOrder(order) {
  const data = await readData();
  order.id = data.orders.length ? data.orders[data.orders.length-1].id + 1 : 1;
  // Đảm bảo luôn có trường items là mảng
  if (!Array.isArray(order.items)) order.items = [];
  data.orders.push(order);
  // Thêm khách hàng nếu chưa có
  if (order.customer && order.customer.phone && !data.customers.some(c => c.phone === order.customer.phone)) {
    data.customers.push({ name: order.customer.name, phone: order.customer.phone });
  }
  await writeData(data);
}

export async function getMenu() {
  const data = await readData();
  return data.menu || [];
}

export async function addMenu(item) {
  const data = await readData();
  item.id = data.menu.length ? data.menu[data.menu.length-1].id + 1 : 1;
  data.menu.push(item);
  await writeData(data);
}

export async function getCustomers() {
  const data = await readData();
  return data.customers || [];
}