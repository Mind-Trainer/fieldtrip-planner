"""Offline unit checks for the Streamlit live planning algorithms."""
import unittest
from unittest.mock import patch

import streamlit_live as live


class LivePlannerTests(unittest.TestCase):
    def test_coordinates(self):
        with patch.object(live, "request_json", side_effect=AssertionError("should not call API")):
            self.assertEqual(live.search_places("8.179, 77.43")[0]["xy"], [77.43, 8.179])
        with self.assertRaises(ValueError):
            live.search_places("95, 250")

    def test_city_results(self):
        with patch.object(live, "request_json", return_value={"results": [
            {"name": "Nagercoil", "admin1": "Tamil Nadu",
             "country": "India", "latitude": 8.179, "longitude": 77.43}
        ]}):
            self.assertEqual(live.search_places("Nagercoil")[0]["xy"], [77.43, 8.179])

    def test_geometry_sections(self):
        points = [[77.0, 8.0], [77.05, 8.0], [77.1, 8.0]]
        chunks = live.sections(points, target_m=4000)
        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[0][0][-1], chunks[1][0][0])
        self.assertGreater(chunks[1][1], 0)

    def test_project(self):
        line = [[77, 8], [77.1, 8]]
        offset, along = live.project(line, [77.05, 8])
        self.assertLess(offset, 1)
        self.assertGreater(along, 1000)

    def test_classify(self):
        self.assertEqual(live.classify({"amenity": "hospital"})[0], "Healthcare")
        self.assertIsNone(live.classify({"amenity": "unknown"}))

    def test_deduplicate(self):
        base = {
            "id": "node/12", "name": "Clinic", "along_m": 100,
            "offset_m": 500, "xy": [77.0, 8.0], "category": "Healthcare"
        }
        closer = dict(base, offset_m=150)
        found = live.merge_facilities({0: [base], 1: [closer]})
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["offset_m"], 150)

    def test_scan_records(self):
        sample = {"elements": [
            {"type": "node", "id": 42, "lon": 77.05, "lat": 8.0,
             "tags": {"amenity": "hospital", "name": "Example Hospital"}},
            {"type": "node", "id": 43, "lon": 80, "lat": 9,
             "tags": {"amenity": "hospital"}},
        ]}
        with patch.object(live, "request_json", return_value=sample):
            found = live.scan_section([[77, 8], [77.1, 8]], 0, 3)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["id"], "node/42")

    def test_route_provider_failure(self):
        with patch.object(live, "request_json", return_value={"code": "NoRoute", "routes": []}):
            with self.assertRaises(live.ProviderError):
                live.route_options([77, 8], [78, 9])

    def test_osrm_response(self):
        data = {"code": "Ok", "routes": [{
            "geometry": {"coordinates": [[77, 8], [78, 9]]},
            "distance": 10000, "duration": 1000,
        }]}
        with patch.object(live, "request_json", return_value=data):
            result = live.route_options([77, 8], [78, 9])
        self.assertEqual(result[0]["distance_m"], 10000)
        self.assertEqual(len(result[0]["id"]), 64)


if __name__ == "__main__":
    unittest.main()
