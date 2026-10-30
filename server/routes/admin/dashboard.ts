export default defineEventHandler(async (event) => {
  return {
    message: "Welcome to the admin dashboard",
    user: {
      name: "Admin",
      role: "Administrator"
    }
  }
})
