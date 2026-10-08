export type Sector = "Agriculture" | "Industry" | "Services"

/** Where the job happens relative to home. `roam` jobs move around all shift. */
export type WorkPlace = "field" | "site" | "office" | "shop" | "roam" | "home"

export interface Occupation {
  title: string
  sector: Sector
  /** Earnings multiplier relative to the national median */
  mult: number
  /** Minimum education index (0 none … 3 tertiary) */
  minEdu: number
  /** Relative frequency in low-income vs high-income economies */
  wLow: number
  wHigh: number
  place: WorkPlace
  /** Share of people in this job working night shifts */
  night: number
  tasks: string[]
}

const o = (
  title: string, sector: Sector, mult: number, minEdu: number, wLow: number, wHigh: number,
  place: WorkPlace, night: number, tasks: string,
): Occupation => ({ title, sector, mult, minEdu, wLow, wHigh, place, night, tasks: tasks.split("|") })

export const OCCUPATIONS: Occupation[] = [
  o("Smallholder farmer", "Agriculture", 0.55, 0, 10, 1, "field", 0, "Tending crops|Weeding the field|Harvesting|Irrigating the plot|Planting seedlings"),
  o("Livestock herder", "Agriculture", 0.6, 0, 3, 0.5, "roam", 0, "Herding goats|Moving cattle to pasture|Milking the herd|Watering animals"),
  o("Farm labourer", "Agriculture", 0.5, 0, 5, 1, "field", 0, "Picking fruit|Loading sacks of grain|Spraying crops|Clearing irrigation ditches"),
  o("Fisher", "Agriculture", 0.7, 0, 1.5, 0.5, "roam", 0.2, "Casting nets|Mending nets|Hauling in the catch|Selling fish at the dock"),
  o("Farm owner", "Agriculture", 1.6, 1, 0.3, 3, "field", 0, "Driving the tractor|Checking crop yields|Repairing farm equipment|Negotiating with buyers"),

  o("Factory worker", "Industry", 0.9, 1, 3, 3, "site", 0.2, "Operating machinery|Assembling parts|Quality inspection|Packing boxes"),
  o("Garment worker", "Industry", 0.7, 0, 2, 0.3, "site", 0.05, "Sewing garments|Cutting fabric|Ironing finished clothes"),
  o("Construction worker", "Industry", 0.85, 0, 3, 2, "site", 0, "Laying bricks|Pouring concrete|Carrying materials|Building scaffolding"),
  o("Mechanic", "Industry", 1.0, 1, 1.2, 1.2, "shop", 0, "Fixing an engine|Changing tyres|Diagnosing a fault"),
  o("Electrician", "Industry", 1.3, 2, 0.6, 1.2, "roam", 0, "Wiring a building|Repairing power lines|Installing solar panels"),
  o("Miner", "Industry", 1.2, 0, 0.7, 0.3, "site", 0.3, "Drilling underground|Operating a loader|Sorting ore"),
  o("Engineer", "Industry", 2.0, 3, 0.2, 1.5, "office", 0, "Reviewing blueprints|Running simulations|Inspecting a production line"),

  o("Street vendor", "Services", 0.55, 0, 4, 0.2, "roam", 0, "Selling snacks on the street|Calling out to customers|Restocking the cart"),
  o("Shopkeeper", "Services", 1.0, 1, 3, 1.5, "shop", 0, "Serving customers|Stocking shelves|Counting the till"),
  o("Driver", "Services", 0.9, 1, 2, 1.5, "roam", 0.15, "Driving passengers|Delivering goods|Waiting at the taxi rank"),
  o("Delivery rider", "Services", 0.7, 1, 1, 1, "roam", 0.1, "Delivering food|Picking up parcels|Riding through traffic"),
  o("Domestic worker", "Services", 0.5, 0, 2, 0.5, "office", 0, "Cleaning a house|Doing laundry|Looking after children"),
  o("Cook / waiter", "Services", 0.75, 0, 1.5, 2, "shop", 0.1, "Cooking in a restaurant|Serving tables|Washing dishes"),
  o("Cleaner", "Services", 0.6, 0, 1, 1.5, "office", 0.3, "Mopping floors|Cleaning offices|Emptying bins"),
  o("Security guard", "Services", 0.75, 1, 1, 1, "office", 0.5, "Guarding a gate|Patrolling the premises|Checking IDs"),
  o("Hairdresser", "Services", 0.8, 1, 0.8, 0.8, "shop", 0, "Cutting hair|Braiding hair|Chatting with clients"),
  o("Teacher", "Services", 1.2, 3, 1.2, 2.5, "office", 0, "Teaching a class|Grading homework|Preparing lessons"),
  o("Nurse", "Services", 1.2, 2, 0.6, 2, "office", 0.3, "Checking on patients|Administering medicine|Updating charts"),
  o("Doctor", "Services", 2.8, 3, 0.15, 0.8, "office", 0.2, "Seeing patients|Doing ward rounds|Reviewing test results"),
  o("Office clerk", "Services", 1.1, 2, 1, 3, "office", 0, "Processing paperwork|Answering emails|Data entry"),
  o("Call centre agent", "Services", 0.9, 2, 0.3, 1, "office", 0.2, "Handling customer calls|Logging tickets"),
  o("Accountant", "Services", 1.6, 3, 0.3, 1.5, "office", 0, "Balancing the books|Preparing tax returns|Auditing invoices"),
  o("Sales representative", "Services", 1.2, 2, 0.6, 2, "roam", 0, "Meeting a client|Pitching products|Driving to appointments"),
  o("Software developer", "Services", 2.4, 3, 0.1, 1.5, "office", 0, "Writing code|Fixing a bug|In a stand-up meeting|Reviewing a pull request"),
  o("Manager", "Services", 2.2, 3, 0.2, 1.5, "office", 0, "Running a meeting|Reviewing budgets|Planning the quarter"),
  o("Civil servant", "Services", 1.3, 2, 0.8, 1.5, "office", 0, "Processing applications|Attending a briefing|Drafting a report"),
  o("Police officer", "Services", 1.2, 2, 0.5, 0.8, "roam", 0.3, "On patrol|Directing traffic|Writing a report"),
  o("Soldier", "Services", 1.0, 1, 0.5, 0.4, "site", 0.2, "Drilling|Standing guard|Maintaining equipment"),
  o("Tailor / artisan", "Services", 0.7, 0, 1.2, 0.3, "shop", 0, "Stitching clothes|Carving wood|Weaving a basket"),
  o("Market trader", "Services", 0.8, 0, 2.5, 0.3, "shop", 0, "Haggling with customers|Arranging produce|Weighing goods"),
  o("Musician / artist", "Services", 0.8, 1, 0.2, 0.5, "home", 0.3, "Practising an instrument|Painting|Rehearsing with the band"),
]

/** Non-working roles */
export type Role = "Worker" | "Student" | "Pupil" | "Child" | "Retired" | "Homemaker" | "Unemployed"
