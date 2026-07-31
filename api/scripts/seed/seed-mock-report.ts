import { sql } from "../db";
import { computeUrgency } from "../../../lib/utils/urgency";

const lat=15.0733, lng=120.5406;
const exif={GPSLatitude:lat,GPSLongitude:lng,DateTimeOriginal:new Date().toISOString(),Make:"Porac SDSS",Model:"Mock Citizen Camera"};
async function main(){
 const [citizen]=await sql<{id:number}[]>`SELECT id FROM citizens WHERE email='citizen@porac.ph'`;
 if(!citizen) throw new Error('Run seed:users first');
 const [barangay]=await sql<{id:number;name:string}[]>`SELECT id,name FROM barangays WHERE ST_Contains(geom,ST_SetSRID(ST_MakePoint(${lng},${lat}),4326))`;
 if(!barangay) throw new Error('Mock point is outside Porac barangays');
 const [e]=await sql<{elevation_m:number}[]>`SELECT elevation_m FROM dem_points ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng},${lat}),4326) LIMIT 1`;
 const [bounds]=await sql<{min:number;max:number}[]>`SELECT min(elevation_m)::float AS min,max(elevation_m)::float AS max FROM dem_points`;
 const urgency=computeUrgency({elevationM:e.elevation_m,elevMin:bounds.min,elevMax:bounds.max,memberCount:1});
 const [ticket]=await sql<{id:number}[]>`INSERT INTO tickets(category,barangay_id,status,member_count,elevation_m,assigned_office,geom,elevation_factor,precipitation_factor,cluster_factor,urgency_score,urgency_band) VALUES('Pothole',${barangay.id},'Reported',1,${e.elevation_m},'MEO',ST_SetSRID(ST_MakePoint(${lng},${lat}),4326),${urgency.elevationFactor},${urgency.precipitationFactor},${urgency.clusterFactor},${urgency.urgencyScore},${urgency.urgencyBand}) RETURNING id`;
 await sql`INSERT INTO reports(ticket_id,citizen_id,title,description,citizen_severity,elevation_m,image_url,geom,pin_geom,exif_geom,exif_captured_at,flags) VALUES(${ticket.id},${citizen.id},'POTHOLE: main road pavement defect','Deep pavement defect caused by heavy sand hauling trucks near main road segment','High',${e.elevation_m},'mock://porac-exif-geotag.jpg',ST_SetSRID(ST_MakePoint(${lng},${lat}),4326),ST_SetSRID(ST_MakePoint(${lng},${lat}),4326),ST_SetSRID(ST_MakePoint(${lng},${lat}),4326),${exif.DateTimeOriginal},ARRAY[${`MOCK_EXIF:${JSON.stringify(exif)}`}])`;
 console.log(JSON.stringify({ticketId:ticket.id,barangay:barangay.name,elevationM:e.elevation_m,priority:urgency.urgencyScore,exif})); await sql.end();
}
main().catch(async error=>{console.error(error);await sql.end();process.exit(1)});