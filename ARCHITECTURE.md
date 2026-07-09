# Karnegar Architecture

## Product Vision

Karnegar is a digital lifetime record for vehicles.

The main entity of the system is the vehicle, not the owner.

---

## Vehicle Identity

VIN (Vehicle Identification Number) is the primary identity of every vehicle.

License plate is not used as the main identifier because:
- It belongs to the owner.
- It can change after ownership transfer.
- It creates poor user experience during data entry.

---

## Ownership Model

Vehicle ownership is separated from vehicle identity.

A vehicle can have multiple owners during its lifetime.

Ownership transfer does not create a new vehicle record.

---

## Vehicle History

Vehicle service history belongs to the vehicle itself.

Previous service records remain available after ownership transfer.

---

## Privacy

New owners can access vehicle health history.

Previous owner's personal information remains private.

---

## Future Growth

The architecture should support:

- Vehicle transfer
- Service centers
- Reminders
- Notifications
- Mobile applications
- Large scale users