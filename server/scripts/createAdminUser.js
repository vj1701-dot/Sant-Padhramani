const userService = require('../services/userService');

async function createAdminUser() {
    try {
        // Create admin user
        const adminUser = await userService.createUser(
            'admin@santpadharamani.com',
            'admin123456',
            'Administrator'
        );

        // Approve the admin user
        await userService.approveUser('admin@santpadharamani.com');

        console.log('Admin user created and approved successfully:');
        console.log('Email: admin@santpadharamani.com');
        console.log('Password: admin123456');
        console.log('\nPlease change the password after first login!');
    } catch (error) {
        if (error.message === 'User already exists') {
            console.log('Admin user already exists');
            // Try to approve in case it wasn't approved
            try {
                await userService.approveUser('admin@santpadharamani.com');
                console.log('Admin user approved');
            } catch (approveError) {
                console.log('Admin user was already approved or error occurred:', approveError.message);
            }
        } else {
            console.error('Error creating admin user:', error.message);
        }
    }
}

createAdminUser();