function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

export function hasPermission(permission) {
  const user = readUser();
  return user.roles?.includes('super_admin') || user.permissions?.includes(permission) || false;
}
