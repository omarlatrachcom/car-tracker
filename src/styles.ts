import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f7",
  },
  safeAreaWarning: {
    backgroundColor: "#b42318",
  },
  safeAreaCaution: {
    backgroundColor: "#facc15",
  },
  warningBackground: {
    backgroundColor: "#b42318",
  },
  cautionBackground: {
    backgroundColor: "#facc15",
  },
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#555",
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  containerWarning: {
    backgroundColor: "#b42318",
  },
  containerCaution: {
    backgroundColor: "#facc15",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  titleOnWarning: {
    color: "#fff",
  },
  titleOnCaution: {
    color: "#111",
  },
  subtitle: {
    fontSize: 16,
    color: "#555",
    marginBottom: 20,
  },
  subtitleOnWarning: {
    color: "#ffe7e5",
  },
  subtitleOnCaution: {
    color: "#3f3100",
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#e5e5e5",
    borderRadius: 10,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "700",
  },
  globalWarningBanner: {
    backgroundColor: "#7a1c16",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  globalWarningText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  globalCautionBanner: {
    backgroundColor: "#fff7cc",
    borderColor: "#854d0e",
  },
  globalCautionText: {
    color: "#3f3100",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  smallHint: {
    fontSize: 14,
    color: "#555",
    marginBottom: 14,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
  },
  selectorHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  selectorLabel: {
    flex: 1,
    marginBottom: 0,
  },
  smallIconButton: {
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    marginLeft: 12,
    width: 34,
  },
  smallIconButtonText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 24,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  locationRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  locationTextInput: {
    flex: 1,
  },
  locationButton: {
    width: 104,
    justifyContent: "center",
  },
  locationButtonText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "700",
  },
  readonlyBox: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readonlyValue: {
    fontSize: 16,
    color: "#111",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  stackedOptions: {
    gap: 10,
  },
  optionButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  optionButtonSelected: {
    backgroundColor: "#1f6feb",
    borderColor: "#1f6feb",
  },
  optionButtonText: {
    color: "#222",
    fontWeight: "600",
  },
  optionButtonTextSelected: {
    color: "#fff",
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e4e4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  collapsibleHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  collapsibleTitle: {
    flex: 1,
    marginBottom: 0,
  },
  collapseToggle: {
    color: "#111",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 24,
    marginLeft: 12,
    minWidth: 24,
    textAlign: "center",
  },
  collapsibleBody: {
    marginTop: 12,
  },
  cardLine: {
    fontSize: 16,
    marginBottom: 10,
    color: "#222",
  },
  errorText: {
    fontSize: 14,
    color: "#b42318",
    marginBottom: 10,
  },
  overdueStatusText: {
    color: "#b42318",
    fontWeight: "700",
  },
  upcomingStatusText: {
    color: "#a16207",
    fontWeight: "700",
  },
  okStatusText: {
    color: "#047857",
    fontWeight: "700",
  },
  calculationBox: {
    backgroundColor: "#f3f6fb",
    borderWidth: 1,
    borderColor: "#d7e3f4",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  calculationTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
    color: "#1a1a1a",
  },
  calculationValue: {
    fontSize: 15,
    color: "#333",
  },
  historyItem: {
    borderTopWidth: 1,
    borderTopColor: "#ececec",
    paddingTop: 12,
    marginTop: 12,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  historyLine: {
    fontSize: 15,
    color: "#333",
    marginBottom: 6,
  },
  historySection: {
    marginTop: 8,
  },
  reportListButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d0d0d0",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reportListButtonText: {
    color: "#111",
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  reportListButtonValue: {
    color: "#444",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 12,
  },
  reportTotalCard: {
    backgroundColor: "#111",
    borderRadius: 12,
    marginBottom: 16,
    padding: 18,
  },
  reportTotalLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  reportTotalValue: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
  },
  reportSummaryRow: {
    alignItems: "center",
    borderTopColor: "#ececec",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  reportSummaryLabel: {
    color: "#222",
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  reportSummaryValue: {
    color: "#111",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 12,
  },
  reportChart: {
    gap: 14,
  },
  reportChartRow: {
    gap: 8,
  },
  reportChartHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reportChartLabel: {
    color: "#222",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  reportChartValue: {
    color: "#444",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
  },
  reportBarTrack: {
    backgroundColor: "#eef2f7",
    borderRadius: 8,
    height: 12,
    overflow: "hidden",
  },
  reportBarFill: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    height: "100%",
  },
  primaryButton: {
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  flexButton: {
    flex: 1,
    marginTop: 0,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#e5e5e5",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "700",
  },
  dangerButton: {
    backgroundColor: "#b42318",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  dangerButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
