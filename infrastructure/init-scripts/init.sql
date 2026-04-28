-- Active: 1777382769702@@127.0.0.1@5432@irctc_db
-- Create Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Trains Table
CREATE TABLE trains (
    id SERIAL PRIMARY KEY,
    train_number VARCHAR(10) UNIQUE NOT NULL,
    train_name VARCHAR(100) NOT NULL,
    source VARCHAR(50) NOT NULL,
    destination VARCHAR(50) NOT NULL,
    total_seats INT NOT NULL,
    available_seats INT NOT NULL,
    CONSTRAINT check_seats_positive CHECK (available_seats >= 0) -- Crucial for preventing overbooking
);

-- Create Bookings Table
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    train_id INT REFERENCES trains(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, CONFIRMED, FAILED
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert a dummy train for testing
INSERT INTO trains (train_number, train_name, source, destination, total_seats, available_seats) 
VALUES ('12637', 'Pandian Express', 'Madurai', 'Chennai', 100, 100);