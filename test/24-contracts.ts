import { assert, expect } from 'chai';

import * as semver from 'semver';

import * as constants from '../src/lib/constants';
import {
	containerContractsFulfilled,
	validateContract,
} from '../src/lib/contracts';
import * as osRelease from '../src/lib/os-release';
import supervisorVersion = require('../src/lib/supervisor-version');

describe('Container contracts', () => {
	describe('Contract validation', () => {
		it('should correctly validate a contract with no requirements', () => {
			assert(
				validateContract({
					slug: 'user-container',
				}),
			);
		});

		it('should correctly validate a contract with extra fields', () => {
			assert(
				validateContract({
					slug: 'user-container',
					name: 'user-container',
					version: '3.0.0',
				}),
			);
		});

		it('should not validate a contract without the minimum required fields', () => {
			expect(() => {
				validateContract({});
			}).to.throw();
			expect(() => {
				validateContract({ name: 'test' });
			}).to.throw();
			expect(() => {
				validateContract({ requires: [] });
			}).to.throw();
		});

		it('should correctly validate a contract with requirements', () => {
			assert(
				validateContract({
					slug: 'user-container',
					requires: [
						{
							type: 'sw.os',
							version: '>3.0.0',
						},
						{
							type: 'sw.supervisor',
						},
					],
				}),
			);
		});

		it('should not validate a contract with requirements without the minimum required fields', () => {
			expect(() =>
				validateContract({
					slug: 'user-container',
					requires: [
						{
							version: '>3.0.0',
						},
					],
				}),
			).to.throw();
		});
	});

	describe('Requirement resolution', () => {
		// Because the supervisor version will change whenever the
		// package.json will, we generate values which are above
		// and below the current value, and use these to reason
		// about the contract engine results
		const supervisorVersionGreater = `${semver.major(supervisorVersion)! +
			1}.0.0`;
		const supervisorVersionLesser = `${semver.major(supervisorVersion)! -
			1}.0.0`;

		before(async () => {
			// We ensure that the versions we're using for testing
			// are the same as the time of implementation, otherwise
			// these tests could fail or succeed when they shouldn't
			expect(await osRelease.getOSSemver(constants.hostOSVersionPath)).to.equal(
				'2.0.6',
			);
			assert(semver.gt(supervisorVersionGreater, supervisorVersion));
			assert(semver.lt(supervisorVersionLesser, supervisorVersion));
		});

		it('Should correctly run containers with no requirements', async () => {
			expect(
				await containerContractsFulfilled({
					service: {
						type: 'sw.container',
						slug: 'user-container',
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
			expect(
				await containerContractsFulfilled({
					service: {
						type: 'sw.container',
						slug: 'user-container1',
					},
					service2: {
						type: 'sw.container',
						slug: 'user-container2',
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
		});

		it('should correctly run containers whose requirements are satisfied', async () => {
			expect(
				await containerContractsFulfilled({
					service: {
						type: 'sw.container',
						name: 'user-container',
						slug: 'user-container',
						requires: [
							{
								type: 'sw.os',
								version: '>2.0.0',
							},
						],
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);

			expect(
				await containerContractsFulfilled({
					service: {
						type: 'sw.container',
						name: 'user-container',
						slug: 'user-container',
						requires: [
							{
								type: 'sw.supervisor',
								version: `<${supervisorVersionGreater}`,
							},
						],
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);

			expect(
				await containerContractsFulfilled({
					service: {
						type: 'sw.container',
						name: 'user-container',
						slug: 'user-container',
						requires: [
							{
								type: 'sw.supervisor',
								version: `>${supervisorVersionLesser}`,
							},
						],
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);

			expect(
				await containerContractsFulfilled({
					service: {
						type: 'sw.container',
						name: 'user-container',
						slug: 'user-container',
						requires: [
							{
								type: 'sw.supervisor',
								version: `>${supervisorVersionLesser}`,
							},
							{
								type: 'sw.os',
								version: '<3.0.0',
							},
						],
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
			expect(
				await containerContractsFulfilled({
					service: {
						type: 'sw.container',
						name: 'user-container1',
						slug: 'user-container1',
						requires: [
							{
								type: 'sw.supervisor',
								version: `>${supervisorVersionLesser}`,
							},
						],
					},
					service2: {
						type: 'sw.container',
						name: 'user-container1',
						slug: 'user-container1',
						requires: [
							{
								type: 'sw.os',
								version: '<3.0.0',
							},
						],
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
		});

		it('Should refuse to run containers whose requirements are not satisfied', async () => {
			let fulfilled = await containerContractsFulfilled({
				service: {
					type: 'sw.container',
					name: 'user-container',
					slug: 'user-container',
					requires: [
						{
							type: 'sw.os',
							version: '>=3.0.0',
						},
					],
				},
			});
			expect(fulfilled)
				.to.have.property('valid')
				.that.equals(false);
			expect(fulfilled)
				.to.have.property('unmetServices')
				.that.deep.equals(['service']);

			fulfilled = await containerContractsFulfilled({
				service2: {
					type: 'sw.container',
					name: 'user-container2',
					slug: 'user-container2',
					requires: [
						{
							type: 'sw.supervisor',
							version: `>=${supervisorVersionLesser}`,
						},
						{
							type: 'sw.os',
							version: '>3.0.0',
						},
					],
				},
			});
			expect(fulfilled)
				.to.have.property('valid')
				.that.equals(false);
			expect(fulfilled)
				.to.have.property('unmetServices')
				.that.deep.equals(['service2']);

			fulfilled = await containerContractsFulfilled({
				service: {
					type: 'sw.container',
					name: 'user-container1',
					slug: 'user-container1',
					requires: [
						{
							type: 'sw.supervisor',
							version: `>=${supervisorVersionLesser}`,
						},
					],
				},
				service2: {
					type: 'sw.container',
					name: 'user-container2',
					slug: 'user-container2',
					requires: [
						{
							type: 'sw.supervisor',
							version: `<=${supervisorVersionLesser}`,
						},
					],
				},
			});
			expect(fulfilled)
				.to.have.property('valid')
				.that.equals(false);
			expect(fulfilled)
				.to.have.property('unmetServices')
				.that.deep.equals(['service2']);
		});
	});
});
