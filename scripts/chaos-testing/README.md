# Cygni Chaos Testing

This directory contains scripts for chaos engineering and failure testing to ensure Cygni can handle real-world failure scenarios.

## Failure Friday

Our weekly chaos testing ritual to verify automatic rollback and alerting systems.

### Running the Test

```bash
# Basic health gate failure test
./failure-friday.sh

# Specific failure scenarios
./failure-friday.sh health-gate      # Inject health gate failure
./failure-friday.sh high-latency     # Inject high latency
./failure-friday.sh pod-failure      # Kill a random pod
./failure-friday.sh resource-pressure # Create resource pressure

# Test specific service/namespace
NAMESPACE=staging SERVICE=api-server ./failure-friday.sh
```

### What It Tests

1. **Automatic Rollback**: Verifies that deployments automatically roll back when health gates fail
2. **Alerting**: Ensures alerts fire to PagerDuty, Slack, and email
3. **Recovery Time**: Measures how quickly the system recovers
4. **Data Integrity**: Confirms no data loss during failures

### Pre-Flight Checklist

Before running chaos tests:

- [ ] Ensure you're NOT testing in production (unless approved)
- [ ] Have monitoring dashboards open
- [ ] Alert team members that a test is starting
- [ ] Document the test scenario and expected outcomes

### Post-Test Actions

After each test:

1. **Verify Recovery**: Ensure all services returned to healthy state
2. **Check Alerts**: Confirm all expected alerts were received
3. **Review Logs**: Look for any unexpected errors or behaviors
4. **Document Findings**: Record any issues or improvements needed
5. **Update Runbooks**: Improve incident response procedures based on findings

### Failure Scenarios

#### Health Gate Failure

Simulates a deployment that starts returning errors above the configured threshold.

- Sets max error rate to 0.01% (impossible to maintain)
- Should trigger automatic rollback within 2-5 minutes

#### High Latency

Tests response to performance degradation.

- Sets P95 latency threshold to 10ms (very low)
- Validates performance-based rollbacks

#### Pod Failure

Simulates infrastructure failures.

- Forcefully deletes a running pod
- Tests pod recovery and session handling

#### Resource Pressure

Creates memory/CPU pressure scenarios.

- Reduces resource limits dramatically
- Tests autoscaling and OOM handling

### Integration with CI/CD

Add to your CI pipeline for automated chaos testing:

```yaml
# .github/workflows/chaos-test.yml
name: Chaos Testing
on:
  schedule:
    - cron: "0 10 * * 5" # Every Friday at 10 AM
jobs:
  chaos-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Failure Friday
        run: |
          ./scripts/chaos-testing/failure-friday.sh
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: chaos-test-results
          path: chaos-test-*.log
```

### Monitoring During Tests

Key metrics to watch:

- Error rates and latency percentiles
- Pod restarts and evictions
- Rollback triggers and duration
- Alert delivery time
- Customer impact (if any)

### Safety Controls

The script includes safety mechanisms:

- Automatic cleanup after tests
- Timeout limits to prevent indefinite failures
- Clear logging of all actions taken
- Rollback to known-good configuration

## Contributing

When adding new chaos scenarios:

1. Document the failure mode being tested
2. Add safety controls and cleanup
3. Include success criteria
4. Test in development first
5. Get approval before production tests
